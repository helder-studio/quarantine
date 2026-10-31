// @vitest-environment happy-dom
/// <reference lib="dom" />
import { memory, type StorageAdapter } from '@helder-studio/storage';
import { act, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { createQuarantine, type QuarantineStore } from '../core/store';
import { Quarantine, QuarantineProvider, useQuarantineReport } from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let shouldThrow = true;
function Feature() {
  if (shouldThrow) throw new Error('boom');
  return <span>feature</span>;
}

let report: () => void = () => {};
function Reporter() {
  report = useQuarantineReport('upsell', { maxCrashes: 2 });
  return null;
}

function App({ store }: { store: QuarantineStore }) {
  return (
    <QuarantineProvider value={store}>
      <Quarantine
        id="upsell"
        maxCrashes={2}
        fallback={<span>off</span>}
        retryFallback={(retry) => (
          <button type="button" onClick={retry}>
            retry
          </button>
        )}
      >
        <Feature />
      </Quarantine>
    </QuarantineProvider>
  );
}

function container() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

function mount(ui: ReactNode) {
  const el = container();
  const root = createRoot(el);
  act(() => root.render(ui));
  return el;
}

function quarantinedStorage() {
  const storage = memory();
  const seed = createQuarantine({ storage, quarantineInDev: true });
  seed.recordCrash('upsell', { maxCrashes: 1 });
  return storage;
}

let consoleError: MockInstance;
beforeEach(() => {
  shouldThrow = true;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
  document.body.innerHTML = '';
});

describe('<Quarantine>', () => {
  it('shows the retry fallback under the threshold and the fallback at it', () => {
    const el = mount(<App store={createQuarantine({ quarantineInDev: true })} />);
    expect(el.textContent).toBe('retry');
    act(() => el.querySelector('button')?.click());
    expect(el.textContent).toBe('off');
  });

  it('renders children again after a successful retry', () => {
    const el = mount(<App store={createQuarantine({ quarantineInDev: true })} />);
    shouldThrow = false;
    act(() => el.querySelector('button')?.click());
    expect(el.textContent).toBe('feature');
  });

  it('shows the fallback straight away for a stored quarantine', () => {
    const store = createQuarantine({ storage: quarantinedStorage(), quarantineInDev: true });
    expect(mount(<App store={store} />).textContent).toBe('off');
  });

  it('renders children until async storage answers, then the fallback', async () => {
    const inner = quarantinedStorage();
    const slow: StorageAdapter = {
      getItem: async (k) => inner.getItem(k),
      setItem: async (k, v) => inner.setItem(k, v),
      removeItem: async (k) => inner.removeItem(k),
    };
    shouldThrow = false;
    const store = createQuarantine({ storage: slow, quarantineInDev: true });
    const el = mount(<App store={store} />);
    expect(el.textContent).toBe('feature');
    await act(() => store.ready);
    expect(el.textContent).toBe('off');
  });

  it('hydrates server HTML without a mismatch, then applies the quarantine', () => {
    shouldThrow = false;
    const server = createQuarantine({ quarantineInDev: true });
    const el = container();
    el.innerHTML = renderToString(<App store={server} />);
    expect(el.textContent).toBe('feature');

    const client = createQuarantine({ storage: quarantinedStorage(), quarantineInDev: true });
    act(() => {
      hydrateRoot(el, <App store={client} />);
    });
    expect(el.textContent).toBe('off');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('useQuarantineReport counts crashes outside render toward the same feature', () => {
    shouldThrow = false;
    const store = createQuarantine({ quarantineInDev: true });
    const el = mount(
      <QuarantineProvider value={store}>
        <Reporter />
        <App store={store} />
      </QuarantineProvider>,
    );
    expect(el.textContent).toBe('feature');
    act(() => report());
    act(() => report());
    expect(el.textContent).toBe('off');
  });

  it('throws a clear error without a provider', () => {
    expect(() => renderToString(<Quarantine id="x" />)).toThrow(/QuarantineProvider/);
  });
});
