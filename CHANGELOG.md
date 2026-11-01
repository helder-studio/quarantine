# @helder-studio/quarantine

## 0.1.0

### Minor Changes

- 52b8249: Add isReleased remote override, useQuarantineReport for errors outside render, multi-tab sync, and list() / release(id) for debugging.
- 79ab476: First release: createQuarantine, QuarantineProvider and the Quarantine error boundary with persisted crash ledger, cooldown, appVersion reset and onQuarantine.

### Patch Changes

- 6caebfa: Fix: a quarantined feature now comes back on its own when the cooldown ends, without waiting for another re-render.
