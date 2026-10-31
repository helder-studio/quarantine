# @helder-studio/quarantine

Error boundary that switches a feature off for one user after N crashes in a window, with cooldown,
app-version reset and remote release. Web + React Native, pure JS. PDF: "Library 1: Quarantine".

## API (target)

```tsx
const quarantine = createQuarantine({
  storage: asyncStorage(AsyncStorage), // any StorageAdapter from @helder-studio/storage
  appVersion: '1.4.0', // a new version clears quarantines
  onQuarantine: (e) => track('feature_quarantined', e), // once per quarantine, not per crash
  isReleased: (id) => flags.isOn(`release:${id}`), // optional remote override
});

<QuarantineProvider value={quarantine}>
  <Quarantine id="checkout-upsell" maxCrashes={3} window="24h" cooldown="7d" fallback={null}>
    <UpsellCarousel />
  </Quarantine>
</QuarantineProvider>;

const report = useQuarantineReport('checkout-upsell'); // errors boundaries can't see
```

## Layout

- `src/core/`: crash ledger per id (timestamps in window, `quarantinedUntil`, `appVersion`); pure
  `recordCrash(state, now)` / `isQuarantined(state, now)` with injected clock. No React imports.
- `src/react/`: store (in-memory snapshot hydrated from storage, async flush, `useSyncExternalStore`),
  class error boundary, provider, hooks.

## Edge cases

- AsyncStorage answers after first render: render children, switch to fallback once hydrated.
- SSR: server snapshot is always "not quarantined"; apply after hydration (no mismatch).
- Dev: record but never quarantine unless `quarantineInDev` (Fast Refresh would quarantine your work).
- Crashes above the boundary aren't caught: docs say wrap features, not screens.
- Storage write fails or quota full: keep state in memory, never throw.
- Privacy: store ids and timestamps only, never error messages.

## Status

MVP + most of v0.1 done: `src/core/ledger.ts` (pure ledger), `src/core/store.ts` (`createQuarantine`:
hydration, appVersion reset, `onQuarantine`, dev guard, never-throw persistence under one key
`helder-studio:quarantine`), `src/react/index.tsx` (provider, `<Quarantine>`, class boundary).
React tests run in happy-dom with React's `act` (no Testing Library). Examples: `examples/next` and `examples/expo` install the library from `examples/quarantine.tgz`
(`pnpm example:pack`; `file:` directory links don't copy `dist` on exFAT). Next: RNTL test, then v0.2 (`isReleased`, `useQuarantineReport`, multi-tab sync, `list`/`release`).

## Commands

`pnpm verify`, `pnpm coverage` (gate: core > 90%), `pnpm changeset`.
