/** Crash history for one feature id. Timestamps only, never error details. */
export interface Ledger {
  /** Crash times (ms) inside the current window, oldest first. */
  crashes: number[];
  /** While `now < quarantinedUntil` the feature is off. */
  quarantinedUntil?: number;
}

export interface Policy {
  maxCrashes: number;
  windowMs: number;
  cooldownMs: number;
}

export function isQuarantined(ledger: Ledger | undefined, now: number): boolean {
  return ledger?.quarantinedUntil !== undefined && now < ledger.quarantinedUntil;
}

/**
 * Adds a crash at `now`. Crashes older than the window drop out; reaching `maxCrashes`
 * quarantines the feature for `cooldownMs` and starts a fresh window.
 */
export function recordCrash(
  ledger: Ledger | undefined,
  now: number,
  policy: Policy,
): { ledger: Ledger; quarantined: boolean } {
  if (isQuarantined(ledger, now)) return { ledger: ledger as Ledger, quarantined: false };
  const crashes = (ledger?.crashes ?? []).filter((t) => now - t < policy.windowMs);
  crashes.push(now);
  if (crashes.length >= policy.maxCrashes) {
    return {
      ledger: { crashes: [], quarantinedUntil: now + policy.cooldownMs },
      quarantined: true,
    };
  }
  return { ledger: { crashes }, quarantined: false };
}
