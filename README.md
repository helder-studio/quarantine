<div align="center">

# @helder-studio/quarantine

**Stop one broken feature from crashing your app over and over.**

An error boundary that switches a feature off for one user after repeated crashes, then brings it back
after a cooldown or a new app version. React and React Native.

[![npm](https://img.shields.io/npm/v/@helder-studio/quarantine?color=cb3837&logo=npm)](https://www.npmjs.com/package/@helder-studio/quarantine)
[![bundle size](https://img.shields.io/bundlejs/size/@helder-studio/quarantine?label=min%2Bgzip&exports=Quarantine,createQuarantine)](https://bundlejs.com/?q=@helder-studio/quarantine)
[![CI](https://github.com/helder-studio/quarantine/actions/workflows/ci.yml/badge.svg)](https://github.com/helder-studio/quarantine/actions/workflows/ci.yml)
[![provenance](https://img.shields.io/badge/npm-provenance-2ea44f?logo=sigstore)](https://www.npmjs.com/package/@helder-studio/quarantine#provenance)
[![license](https://img.shields.io/npm/l/@helder-studio/quarantine?color=blue)](./LICENSE)

<!-- demo GIF -->

</div>

```sh
npm install @helder-studio/quarantine
```

## Why

A normal error boundary catches a crash and shows a fallback. Next launch, the same broken carousel
crashes again, and again, for the same user, until you ship a fix. Quarantine remembers: after
`maxCrashes` inside `window`, that feature stays off for that user for `cooldown`. Everything else keeps
working, and you get one analytics event instead of a crash loop.

## Quick start

```tsx
import { createQuarantine, Quarantine, QuarantineProvider } from '@helder-studio/quarantine';
import { webStorage } from '@helder-studio/storage';

const quarantine = createQuarantine({ storage: webStorage(), appVersion: '1.4.0' });

<QuarantineProvider value={quarantine}>
  <Quarantine id="checkout-upsell" maxCrashes={3} window="24h" cooldown="7d" fallback={null}>
    <UpsellCarousel />
  </Quarantine>
</QuarantineProvider>;
```

## Features

- 🧯 **Per-feature, per-user**: one crashing widget goes dark, the screen around it keeps working
- ⏳ **Self-healing**: quarantine lifts after the cooldown, and a new `appVersion` clears it at once
- 📈 **One event, not a flood**: `onQuarantine` fires once per quarantine, ready for your analytics
- 🌐 **SSR-safe**: server and hydration render "not quarantined", so no hydration mismatch
- 🔁 **Remote release**: `isReleased(id)` turns a feature back on from your feature flags
- 🧑‍💻 **Dev-friendly**: Fast Refresh crashes are recorded but never quarantine your own work
- 🔐 **Private by design**: stores feature ids and timestamps, never error messages or user data
- 🪶 **Tiny**: about 1.2 kB, works with any [`@helder-studio/storage`](https://github.com/helder-studio/storage) adapter

## Storage

Pass any adapter from `@helder-studio/storage`. Without one, state lives in memory until reload.

| App                | Adapter                      | First render                         |
| ------------------ | ---------------------------- | ------------------------------------ |
| Web / Next.js      | `webStorage()`               | quarantined immediately              |
| React Native, MMKV | `mmkv(createMMKV())`         | quarantined immediately              |
| React Native       | `asyncStorage(AsyncStorage)` | children first, fallback once loaded |
| Tests              | `memory()`                   | quarantined immediately              |

## API

### `createQuarantine(options)`

| Option            | Type                               | Default    | Notes                                       |
| ----------------- | ---------------------------------- | ---------- | ------------------------------------------- |
| `storage`         | `StorageAdapter`                   | `memory()` | where crash history is kept                 |
| `appVersion`      | `string`                           |            | a different version clears every quarantine |
| `onQuarantine`    | `({ id, crashes, until }) => void` |            | once per quarantine, not per crash          |
| `isReleased`      | `(id) => boolean`                  |            | remote override, e.g. a feature flag        |
| `quarantineInDev` | `boolean`                          | `false`    | quarantine in development builds too        |

### `<Quarantine>`

| Prop            | Type                                                                       | Default    |
| --------------- | -------------------------------------------------------------------------- | ---------- |
| `id`            | `string`                                                                   | required   |
| `maxCrashes`    | `number`                                                                   | `3`        |
| `window`        | `number` (ms) or `'30s' \| '15m' \| '24h' \| '7d'`                         | `'24h'`    |
| `cooldown`      | same as `window`                                                           | `'7d'`     |
| `fallback`      | `ReactNode`, shown while quarantined                                       | `null`     |
| `retryFallback` | `ReactNode` or `(retry) => ReactNode`, shown after a crash below the limit | `fallback` |

```tsx
<Quarantine
  id="reviews"
  fallback={<Text>Reviews are unavailable right now.</Text>}
  retryFallback={(retry) => <Button title="Try again" onPress={retry} />}
>
  <Reviews />
</Quarantine>;
```

### `useQuarantineReport(id, policy?)`

Error boundaries only see errors thrown while rendering. Report the rest (event handlers, async code)
yourself; they count toward the same feature. Pass the same policy as its `<Quarantine>`.

```tsx
const report = useQuarantineReport('checkout-upsell', { maxCrashes: 3 });

async function onPress() {
  try {
    await loadUpsell();
  } catch {
    report();
  }
}
```

### Debugging and remote release

```ts
quarantine.list(); // [{ id, crashes, quarantinedUntil, quarantined }]
quarantine.release('checkout-upsell'); // clear one feature

createQuarantine({ isReleased: (id) => flags.isOn(`release:${id}`) }); // switch back on remotely
```

On the web, a quarantine in one tab applies to the user's other open tabs right away.

**Placement:** wrap features, not screens. A crash above the boundary isn't caught, and a boundary
around a whole screen would quarantine the screen.

## Examples

Both show the same flaky widget: crash it 3 times within a minute and it stays off for 30 seconds, even
after a reload or app restart.

| Example                             | Storage                      | Run                                                                         |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| [Next.js App Router](examples/next) | `webStorage()`               | `pnpm example:pack`, then `pnpm install && pnpm dev` in `examples/next`     |
| [Expo dev build](examples/expo)     | `asyncStorage(AsyncStorage)` | `pnpm example:pack`, then `pnpm install && pnpm android` in `examples/expo` |

## Compared with react-error-boundary

[react-error-boundary](https://github.com/bvaughn/react-error-boundary) is a great general boundary with
reset keys and hooks, and it forgets everything on reload. Quarantine is narrower: it persists crash
history per feature and decides when to stop rendering it. Use react-error-boundary for screen-level
recovery and Quarantine around features that should switch off when they keep failing.

## Support

If this saves you time, you can buy me a coffee on Ko-fi. It keeps the helder-studio libraries maintained.

<a href="https://ko-fi.com/gorian" target="_blank" rel="noopener">
  <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Support me on Ko-fi" height="40">
</a>

## License

[MIT](./LICENSE) © helder-studio
