import { memory, type StorageAdapter } from '@helder-studio/storage';
import { type Duration, toMs } from './duration';
import { recordCrash as addCrash, isQuarantined, type Ledger } from './ledger';

declare const __DEV__: boolean | undefined;
declare const process: { env: { NODE_ENV?: string } } | undefined;

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

export interface QuarantineStore {
  recordCrash(id: string, policy?: CrashPolicy): void;
  isQuarantined(id: string): boolean;
  subscribe(listener: () => void): () => void;
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
  const { storage = memory(), appVersion, onQuarantine, now = Date.now } = options;
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

  const load = (raw: string | null) => {
    try {
      const data = raw ? (JSON.parse(raw) as Persisted) : undefined;
      if (data?.v === 1 && (appVersion === undefined || data.appVersion === appVersion)) {
        // ponytail: ids crashed before hydration keep only their in-memory ledger.
        ledgers = { ...data.ledgers, ...ledgers };
      }
    } catch {
      // Corrupt data: start empty.
    }
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

  return {
    ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isQuarantined: (id) => active && isQuarantined(ledgers[id], now()),
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
