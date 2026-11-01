import { memory, type StorageAdapter } from '@helder-studio/storage';
import { describe, expect, it, vi } from 'vitest';
import { createQuarantine } from './store';

const KEY = 'helder-studio:quarantine';
const policy = { maxCrashes: 2, window: '1m', cooldown: '1h' } as const;

function clock(start = 0) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v) };
}

function asyncWrap(inner: StorageAdapter): StorageAdapter {
  return {
    getItem: async (k) => inner.getItem(k),
    setItem: async (k, v) => inner.setItem(k, v),
    removeItem: async (k) => inner.removeItem(k),
  };
}

describe('createQuarantine', () => {
  it('quarantines after maxCrashes and notifies subscribers', () => {
    const q = createQuarantine({ quarantineInDev: true });
    const listener = vi.fn();
    q.subscribe(listener);
    q.recordCrash('a', policy);
    expect(q.isQuarantined('a')).toBe(false);
    q.recordCrash('a', policy);
    expect(q.isQuarantined('a')).toBe(true);
    expect(q.isQuarantined('b')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('uses defaults of 3 crashes when no policy is given', () => {
    const q = createQuarantine({ quarantineInDev: true });
    q.recordCrash('a');
    q.recordCrash('a');
    expect(q.isQuarantined('a')).toBe(false);
    q.recordCrash('a');
    expect(q.isQuarantined('a')).toBe(true);
  });

  it('lifts the quarantine after the cooldown', () => {
    const c = clock();
    const q = createQuarantine({ quarantineInDev: true, now: c.now });
    q.recordCrash('a', policy);
    q.recordCrash('a', policy);
    c.set(3_600_000 - 1);
    expect(q.isQuarantined('a')).toBe(true);
    c.set(3_600_000);
    expect(q.isQuarantined('a')).toBe(false);
  });

  it('notifies subscribers when a quarantine ends', () => {
    vi.useFakeTimers();
    try {
      const q = createQuarantine({ quarantineInDev: true, now: () => Date.now() });
      const listener = vi.fn();
      q.subscribe(listener);
      q.recordCrash('a', { maxCrashes: 1, cooldown: '30s' });
      expect(listener).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(29_999);
      expect(listener).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(q.isQuarantined('a')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a reload through storage', () => {
    const storage = memory();
    const first = createQuarantine({ storage, quarantineInDev: true });
    first.recordCrash('a', policy);
    first.recordCrash('a', policy);
    expect(createQuarantine({ storage, quarantineInDev: true }).isQuarantined('a')).toBe(true);
  });

  it('stores ids and timestamps only', () => {
    const storage = memory();
    const q = createQuarantine({
      storage,
      appVersion: '1.0.0',
      quarantineInDev: true,
      now: () => 5,
    });
    q.recordCrash('a', policy);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({
      v: 1,
      appVersion: '1.0.0',
      ledgers: { a: { crashes: [5] } },
    });
  });

  it('clears quarantines when appVersion changes', () => {
    const storage = memory();
    const v1 = createQuarantine({ storage, appVersion: '1.0.0', quarantineInDev: true });
    v1.recordCrash('a', policy);
    v1.recordCrash('a', policy);
    const again = createQuarantine({ storage, appVersion: '1.0.0', quarantineInDev: true });
    expect(again.isQuarantined('a')).toBe(true);
    const v2 = createQuarantine({ storage, appVersion: '1.1.0', quarantineInDev: true });
    expect(v2.isQuarantined('a')).toBe(false);
  });

  it('fires onQuarantine once per quarantine', () => {
    const onQuarantine = vi.fn();
    const q = createQuarantine({ onQuarantine, quarantineInDev: true, now: () => 10 });
    for (let i = 0; i < 4; i++) q.recordCrash('a', policy);
    expect(onQuarantine).toHaveBeenCalledTimes(1);
    expect(onQuarantine).toHaveBeenCalledWith({ id: 'a', crashes: 2, until: 3_600_010 });
  });

  it('keeps working when onQuarantine throws', () => {
    const q = createQuarantine({
      quarantineInDev: true,
      onQuarantine: () => {
        throw new Error('analytics down');
      },
    });
    q.recordCrash('a', policy);
    expect(() => q.recordCrash('a', policy)).not.toThrow();
    expect(q.isQuarantined('a')).toBe(true);
  });

  it('records but never quarantines in development by default', () => {
    const onQuarantine = vi.fn();
    const q = createQuarantine({ onQuarantine });
    q.recordCrash('a', policy);
    q.recordCrash('a', policy);
    expect(q.isQuarantined('a')).toBe(false);
    expect(onQuarantine).not.toHaveBeenCalled();
  });

  it('never throws when storage fails', async () => {
    const broken: StorageAdapter = {
      getItem: () => {
        throw new Error('read');
      },
      setItem: () => Promise.reject(new Error('write')),
      removeItem: () => {},
    };
    const q = createQuarantine({ storage: broken, quarantineInDev: true });
    await q.ready;
    q.recordCrash('a', policy);
    q.recordCrash('a', policy);
    expect(q.isQuarantined('a')).toBe(true);
  });

  it('ignores corrupt stored data', () => {
    const q = createQuarantine({ storage: memory({ [KEY]: '{oops' }), quarantineInDev: true });
    expect(q.isQuarantined('a')).toBe(false);
  });

  it('lets isReleased switch a quarantined feature back on', () => {
    let flag = false;
    const q = createQuarantine({ quarantineInDev: true, isReleased: (id) => id === 'a' && flag });
    q.recordCrash('a', policy);
    q.recordCrash('a', policy);
    expect(q.isQuarantined('a')).toBe(true);
    flag = true;
    expect(q.isQuarantined('a')).toBe(false);
  });

  it('treats a throwing isReleased as not released', () => {
    const q = createQuarantine({
      quarantineInDev: true,
      isReleased: () => {
        throw new Error('flags down');
      },
    });
    q.recordCrash('a', policy);
    q.recordCrash('a', policy);
    expect(q.isQuarantined('a')).toBe(true);
  });

  it('lists features and releases one', () => {
    const storage = memory();
    const q = createQuarantine({ storage, quarantineInDev: true, now: () => 7 });
    q.recordCrash('a', policy);
    q.recordCrash('a', policy);
    q.recordCrash('b', policy);
    expect(q.list()).toEqual([
      { id: 'a', crashes: 0, quarantinedUntil: 3_600_007, quarantined: true },
      { id: 'b', crashes: 1, quarantined: false },
    ]);
    const listener = vi.fn();
    q.subscribe(listener);
    q.release('a');
    q.release('missing');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(q.isQuarantined('a')).toBe(false);
    expect(
      createQuarantine({ storage, quarantineInDev: true })
        .list()
        .map((e) => e.id),
    ).toEqual(['b']);
  });

  it('adopts state written by another tab', () => {
    let onStorage: ((e: { key: string | null; newValue: string | null }) => void) | undefined;
    vi.stubGlobal('addEventListener', (_type: string, listener: typeof onStorage) => {
      onStorage = listener;
    });
    try {
      const other = memory();
      const otherTab = createQuarantine({ storage: other, quarantineInDev: true });
      otherTab.recordCrash('a', policy);
      otherTab.recordCrash('a', policy);

      const q = createQuarantine({ quarantineInDev: true });
      const listener = vi.fn();
      q.subscribe(listener);
      onStorage?.({ key: 'unrelated', newValue: '{}' });
      expect(listener).not.toHaveBeenCalled();
      onStorage?.({ key: KEY, newValue: other.getItem(KEY) as string });
      expect(q.isQuarantined('a')).toBe(true);
      onStorage?.({ key: KEY, newValue: null });
      expect(q.isQuarantined('a')).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('async storage', () => {
    it('is not quarantined until hydrated, then notifies', async () => {
      const inner = memory();
      const seed = createQuarantine({ storage: inner, quarantineInDev: true });
      seed.recordCrash('a', policy);
      seed.recordCrash('a', policy);

      const q = createQuarantine({ storage: asyncWrap(inner), quarantineInDev: true });
      const listener = vi.fn();
      q.subscribe(listener);
      expect(q.isQuarantined('a')).toBe(false);
      await q.ready;
      expect(q.isQuarantined('a')).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('does not overwrite stored state with crashes recorded before hydration', async () => {
      const inner = memory();
      const seed = createQuarantine({ storage: inner, quarantineInDev: true });
      seed.recordCrash('a', policy);
      seed.recordCrash('a', policy);

      const q = createQuarantine({ storage: asyncWrap(inner), quarantineInDev: true });
      q.recordCrash('b', policy);
      await q.ready;
      await Promise.resolve();
      const stored = JSON.parse(inner.getItem(KEY) as string);
      expect(Object.keys(stored.ledgers).sort()).toEqual(['a', 'b']);
    });

    it('treats a rejected read as empty', async () => {
      const q = createQuarantine({
        storage: { ...memory(), getItem: () => Promise.reject(new Error('read')) },
        quarantineInDev: true,
      });
      await q.ready;
      expect(q.isQuarantined('a')).toBe(false);
    });
  });
});
