import { memory, type StorageAdapter } from '@helder-studio/storage';
import { type Duration, toMs } from './duration';
import { recordCrash as addCrash, isQuarantined, type Ledger } from './ledger';

declare const __DEV__: boolean | undefined;
declare const process: { env: { NODE_ENV?: string } } | undefined;
// Present in browsers only; used for multi-tab sync.
declare const addEventListener:
  | ((
      type: 'storage',
      listener: (event: { key: string | null; newValue: string | null }) => void,
    ) => void)
  | undefined;

export interface QuarantineEvent {
  id: string;
  /** Crashes inside the window that triggered the quarantine. */
  crashes: number;
  /** Epoch ms when the feature comes back. */
  until: number;
}

export interface QuarantineOptions {
  /** Any `StorageAdapter`; defaults to `memory()` (nothing survives a reload). */
  storage?: StorageAdapter;
  /** A different version than the stored one clears every quarantine. */
  appVersion?: string;
  /** Fires once per quarantine, not per crash. */
  onQuarantine?: (event: QuarantineEvent) => void;
  /** Remote override: return `true` to switch a quarantined feature back on (e.g. from a feature flag). */
  isReleased?: (id: string) => boolean;
  /** Development builds record crashes but never quarantine unless this is set. */
  quarantineInDev?: boolean;
  /** Clock, for tests. */
  now?: () => number;
}

export interface CrashPolicy {
  /** Crashes inside `window` that quarantine the feature. Default 3. */
  maxCrashes?: number;
  /** Default `'24h'`. */
  window?: Duration;
  /** How long the feature stays off. Default `'7d'`. */
  cooldown?: Duration;
}

export interface QuarantineEntry {
  id: string;
  /** Crashes recorded in the current window. */
  crashes: number;
  quarantinedUntil?: number;
  quarantined: boolean;
}

export interface QuarantineStore {
  recordCrash(id: string, policy?: CrashPolicy): void;
  isQuarantined(id: string): boolean;
  subscribe(listener: () => void): () => void;
  /** Every feature with crash history, for debugging screens. */
  list(): QuarantineEntry[];
  /** Clears one feature's history and quarantine. */
  release(id: string): void;
  /** Resolves once stored state is loaded (immediately for sync storage). */
  readonly ready: Promise<void>;
}

const KEY = 'helder-studio:quarantine';

interface Persisted {
  v: 1;
  appVersion?: string;
  ledgers: Record<string, Ledger>;
}

function isDev(): boolean {
  if (typeof __DEV__ !== 'undefined') return __DEV__;
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

export function createQuarantine(options: QuarantineOptions = {}): QuarantineStore {
  const { storage = memory(), appVersion, onQuarantine, isReleased, now = Date.now } = options;
  const active = options.quarantineInDev === true || !isDev();
  const listeners = new Set<() => void>();
  let ledgers: Record<string, Ledger> = {};
  let hydrated = false;
  let dirty = false;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const persist = () => {
    // Writing before the stored state is loaded would overwrite it.
    if (!hydrated) {
      dirty = true;
      return;
    }
    const t = now();
    const kept: Record<string, Ledger> = {};
    for (const [id, ledger] of Object.entries(ledgers)) {
      if (ledger.crashes.length > 0 || isQuarantined(ledger, t)) kept[id] = ledger;
    }
    const data: Persisted = {
      v: 1,
      ledgers: kept,
      ...(appVersion !== undefined && { appVersion }),
    };
    try {
      Promise.resolve(storage.setItem(KEY, JSON.stringify(data))).catch(() => {});
    } catch {
      // State stays in memory for this session.
    }
  };

  const parse = (raw: string | null): Record<string, Ledger> => {
    try {
      const data = raw ? (JSON.parse(raw) as Persisted) : undefined;
      if (data?.v === 1 && (appVersion === undefined || data.appVersion === appVersion)) {
        return data.ledgers;
      }
    } catch {
      // Corrupt data: start empty.
    }
    return {};
  };

  const load = (raw: string | null) => {
    // ponytail: ids crashed before hydration keep only their in-memory ledger.
    ledgers = { ...parse(raw), ...ledgers };
    hydrated = true;
    if (dirty) persist();
  };

  let raw: string | null | Promise<string | null>;
  try {
    raw = storage.getItem(KEY);
  } catch {
    raw = null;
  }
  const ready =
    typeof raw === 'string' || raw === null
      ? Promise.resolve(load(raw))
      : raw.then(load, () => load(null)).then(emit);

  // Another tab wrote localStorage: adopt its state. Never fires for the writing tab itself.
  // ponytail: the listener lives as long as the page; stores are app-lifetime singletons.
  if (typeof addEventListener === 'function') {
    addEventListener('storage', (event) => {
      if (event.key !== KEY) return;
      ledgers = parse(event.newValue);
      emit();
    });
  }

  const released = (id: string) => {
    try {
      return isReleased?.(id) === true;
    } catch {
      return false;
    }
  };

  return {
    ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isQuarantined: (id) => active && isQuarantined(ledgers[id], now()) && !released(id),
    list() {
      const t = now();
      return Object.entries(ledgers).map(([id, ledger]) => ({
        id,
        crashes: ledger.crashes.length,
        ...(ledger.quarantinedUntil !== undefined && { quarantinedUntil: ledger.quarantinedUntil }),
        quarantined: active && isQuarantined(ledger, t) && !released(id),
      }));
    },
    release(id) {
      if (!(id in ledgers)) return;
      const { [id]: _, ...rest } = ledgers;
      ledgers = rest;
      persist();
      emit();
    },
    recordCrash(id, policy = {}) {
      const maxCrashes = policy.maxCrashes ?? 3;
      const result = addCrash(ledgers[id], now(), {
        maxCrashes,
        windowMs: toMs(policy.window ?? '24h'),
        cooldownMs: toMs(policy.cooldown ?? '7d'),
      });
      ledgers = { ...ledgers, [id]: result.ledger };
      persist();
      if (result.quarantined && active && onQuarantine) {
        try {
          onQuarantine({
            id,
            crashes: maxCrashes,
            until: result.ledger.quarantinedUntil as number,
          });
        } catch {
          // A failing analytics callback must not break the boundary.
        }
      }
      emit();
    },
  };
}
