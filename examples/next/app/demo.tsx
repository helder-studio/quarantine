'use client';

import { createQuarantine, Quarantine, QuarantineProvider } from '@helder-studio/quarantine';
import { webStorage } from '@helder-studio/storage';
import { useState } from 'react';

// Created once per page load. webStorage() is safe to create during server rendering.
const quarantine = createQuarantine({
  storage: webStorage(),
  appVersion: '1.0.0',
  quarantineInDev: true, // so the demo also quarantines under `next dev`
  onQuarantine: (e) => console.info('feature_quarantined', e),
});

function FlakyWidget() {
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error('FlakyWidget crashed');
  return (
    <div style={box('#e6f4ea')}>
      <strong>Recommended for you</strong>
      <p>This widget works until you break it.</p>
      <button type="button" onClick={() => setBroken(true)}>
        Crash the widget
      </button>
    </div>
  );
}

export function Demo() {
  return (
    <QuarantineProvider value={quarantine}>
      <Quarantine
        id="recommendations"
        maxCrashes={3}
        window="1m"
        cooldown="30s"
        fallback={<div style={box('#fdecea')}>Recommendations are switched off for now.</div>}
        retryFallback={(retry) => (
          <div style={box('#fff4e5')}>
            The widget crashed.{' '}
            <button type="button" onClick={retry}>
              Try again
            </button>
          </div>
        )}
      >
        <FlakyWidget />
      </Quarantine>
      <p>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('helder-studio:quarantine');
            location.reload();
          }}
        >
          Reset demo
        </button>
      </p>
    </QuarantineProvider>
  );
}

function box(background: string) {
  return { background, padding: 16, borderRadius: 8, margin: '16px 0' };
}
