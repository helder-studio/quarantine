import { describe, expect, it } from 'vitest';
import { type Duration, toMs } from './duration';

describe('toMs', () => {
  it('converts units', () => {
    expect(toMs('30s')).toBe(30_000);
    expect(toMs('15m')).toBe(900_000);
    expect(toMs('24h')).toBe(86_400_000);
    expect(toMs('7d')).toBe(604_800_000);
    expect(toMs('1.5h')).toBe(5_400_000);
  });

  it('passes milliseconds through', () => {
    expect(toMs(0)).toBe(0);
    expect(toMs(1234)).toBe(1234);
  });

  it('rejects invalid input', () => {
    expect(() => toMs(-1)).toThrow(RangeError);
    expect(() => toMs(Number.NaN)).toThrow(RangeError);
    expect(() => toMs('24x' as Duration)).toThrow(RangeError);
    expect(() => toMs('h' as Duration)).toThrow(RangeError);
  });
});
