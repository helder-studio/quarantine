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

`@helder-studio/storage` is not on npm yet (Phase 0 gate). Add it as a dependency (`^0.1.0`) once
published; until then the core takes a `StorageAdapter`-shaped object. Examples (`examples/expo`,
`examples/next`) come next.

## Commands

`pnpm verify`, `pnpm changeset`.
