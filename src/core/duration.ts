/** A duration as milliseconds or a string like `'30s'`, `'15m'`, `'24h'`, `'7d'`. */
export type Duration = number | `${number}${'s' | 'm' | 'h' | 'd'}`;

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function toMs(duration: Duration): number {
  if (typeof duration === 'number') {
    if (!Number.isFinite(duration) || duration < 0)
      throw new RangeError(`Invalid duration: ${duration}`);
    return duration;
  }
  const match = /^(\d+(?:\.\d+)?)([smhd])$/.exec(duration);
  if (!match) throw new RangeError(`Invalid duration: ${duration}`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}
