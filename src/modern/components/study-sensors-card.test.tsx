import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import { StudySensorsCard } from './study-sensors-card';

// Bun's test runner has no auto-cleanup, so each render would otherwise stack another
// copy of the card in the same document.
afterEach(cleanup);

function renderCard(androidSettings: Record<string, unknown> | undefined) {
  return render(
    <StudySensorsCard
      androidSensors={['ACCELEROMETER']}
      androidSettings={androidSettings}
      iosSensors={[]}
      showAndroid
      showIos={false}
    />,
  );
}

describe('StudySensorsCard cadence summary', () => {
  test('says the cadence is unconfigured rather than inventing one', () => {
    const { container } = renderCard({});
    expect(screen.getByText('Sampling cadence not configured')).toBeTruthy();
    // The old defaults were 5 Hz / 30s active / 270s idle, indistinguishable from real config.
    expect(container.textContent).not.toContain('Hz');
  });

  test('reports a zero sampling rate as zero instead of falling through to a default', () => {
    const { container } = renderCard({ samplingRateHz: 0 });
    expect(screen.getByText('0 Hz')).toBeTruthy();
    expect(container.textContent).not.toContain('5 Hz');
  });

  test('never renders a negative idle window when the active window exceeds the period', () => {
    const { container } = renderCard({
      dutyCycleActiveSeconds: 600,
      dutyCyclePeriodSeconds: 300,
      samplingRateHz: 10,
    });
    expect(container.textContent).not.toContain('-300');
    expect(screen.getByText('600s')).toBeTruthy();
    expect(screen.getByText('300s')).toBeTruthy();
  });

  test('renders the rate alone when only the rate is configured', () => {
    const { container } = renderCard({ samplingRateHz: 40 });
    expect(screen.getByText('40 Hz')).toBeTruthy();
    expect(container.textContent).not.toContain('cycle');
  });
});
