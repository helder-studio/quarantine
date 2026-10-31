import { Component, createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { CrashPolicy, QuarantineStore } from '../core/store';

const QuarantineContext = createContext<QuarantineStore | null>(null);

/** Makes a store from `createQuarantine()` available to every `<Quarantine>` below. */
export const QuarantineProvider = QuarantineContext.Provider;

type RetryFallback = ReactNode | ((retry: () => void) => ReactNode);

export interface QuarantineProps extends CrashPolicy {
  /** Stable feature id, e.g. `'checkout-upsell'`. Stored as is. */
  id: string;
  children?: ReactNode;
  /** Rendered while the feature is quarantined. Default `null`. */
  fallback?: ReactNode;
  /** Rendered after a crash below the threshold. Pass a function to get a `retry` callback. Defaults to `fallback`. */
  retryFallback?: RetryFallback;
}

/** Error boundary that switches `children` off for this user after repeated crashes. */
export function Quarantine({
  id,
  children,
  fallback = null,
  retryFallback,
  ...policy
}: QuarantineProps) {
  const store = useContext(QuarantineContext);
  if (!store) throw new Error('<Quarantine> needs a <QuarantineProvider> above it.');
  // Server and hydration render as "not quarantined"; the client applies it right after.
  const quarantined = useSyncExternalStore(
    store.subscribe,
    () => store.isQuarantined(id),
    () => false,
  );
  if (quarantined) return fallback;
  return (
    <Boundary store={store} id={id} policy={policy} retryFallback={retryFallback ?? fallback}>
      {children}
    </Boundary>
  );
}

interface BoundaryProps {
  store: QuarantineStore;
  id: string;
  policy: CrashPolicy;
  retryFallback: RetryFallback;
  children?: ReactNode;
}

class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // The error itself is never stored: ids and timestamps only.
  override componentDidCatch() {
    this.props.store.recordCrash(this.props.id, this.props.policy);
  }

  retry = () => this.setState({ failed: false });

  override render() {
    if (!this.state.failed) return this.props.children;
    const { retryFallback } = this.props;
    return typeof retryFallback === 'function' ? retryFallback(this.retry) : retryFallback;
  }
}
