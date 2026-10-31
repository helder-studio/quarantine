import { describe, expect, it } from 'vitest';
import { isQuarantined, type Ledger, recordCrash } from './ledger';

const policy = { maxCrashes: 3, windowMs: 1_000, cooldownMs: 10_000 };

function crashAt(times: number[], start?: Ledger) {
  let ledger = start;
  let quarantined = false;
  for (const t of times) ({ ledger, quarantined } = recordCrash(ledger, t, policy));
  return { ledger: ledger as Ledger, quarantined };
}

describe('recordCrash', () => {
  it('quarantines on the Nth crash inside the window', () => {
    expect(crashAt([0, 100]).quarantined).toBe(false);
    const { ledger, quarantined } = crashAt([0, 100, 200]);
    expect(quarantined).toBe(true);
    expect(ledger).toEqual({ crashes: [], quarantinedUntil: 10_200 });
  });

  it('slides the window: crashes older than windowMs drop out', () => {
    const { ledger, quarantined } = crashAt([0, 500, 1_000]);
    expect(quarantined).toBe(false);
    expect(ledger.crashes).toEqual([500, 1_000]);
  });

  it('counts a crash exactly windowMs - 1 old', () => {
    expect(crashAt([0, 1, 999]).quarantined).toBe(true);
  });

  it('ignores crashes while quarantined and reports quarantine only once', () => {
    const first = crashAt([0, 1, 2]);
    const again = recordCrash(first.ledger, 5_000, policy);
    expect(again.quarantined).toBe(false);
    expect(again.ledger).toBe(first.ledger);
  });

  it('starts counting from zero after the cooldown', () => {
    const { ledger } = crashAt([0, 1, 2]);
    const after = crashAt([10_002, 10_003], ledger);
    expect(after.quarantined).toBe(false);
    expect(after.ledger.crashes).toEqual([10_002, 10_003]);
  });
});

describe('isQuarantined', () => {
  it('is false without a ledger or quarantine', () => {
    expect(isQuarantined(undefined, 0)).toBe(false);
    expect(isQuarantined({ crashes: [1] }, 0)).toBe(false);
  });

  it('is true until quarantinedUntil, exclusive', () => {
    const ledger = { crashes: [], quarantinedUntil: 100 };
    expect(isQuarantined(ledger, 99)).toBe(true);
    expect(isQuarantined(ledger, 100)).toBe(false);
  });
});
