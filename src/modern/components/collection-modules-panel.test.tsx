import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import { CollectionModulesPanel } from './collection-modules-panel';

afterEach(cleanup);

const MODULES = [
  {
    description: 'Foreground app usage.',
    label: 'Usage Events',
    privacyClass: 'BEHAVIORAL_METADATA',
    value: 'usage_events',
  },
  {
    description: 'Screen on/off.',
    label: 'Device Lifecycle',
    privacyClass: 'BEHAVIORAL_METADATA',
    value: 'device_lifecycle',
  },
] as const;

const HEALTH_MODULE = {
  description: 'Health data selected by the study.',
  label: 'Health Connect',
  privacyClass: 'HEALTH_DATA',
  value: 'health_connect',
} as const;

describe('CollectionModulesPanel unknown states', () => {
  test('does not claim zero active modules while the settings request is open', () => {
    const { container } = render(<CollectionModulesPanel isLoading modules={MODULES} settings={{}} />);
    expect(container.textContent).not.toContain('0 of 2 active');
    expect(container.textContent).not.toContain('Not collected');
    expect(screen.getByText(/Loading the per-module collection settings/)).toBeTruthy();
  });

  test('does not claim zero active modules after the settings request fails', () => {
    const { container } = render(<CollectionModulesPanel isError modules={MODULES} settings={{}} />);
    expect(container.textContent).not.toContain('0 of 2 active');
    expect(container.textContent).not.toContain('Not collected');
    expect(screen.getByText(/module enablement is unknown/)).toBeTruthy();
  });

  test('summarizes enablement once the settings have loaded', () => {
    render(<CollectionModulesPanel modules={MODULES} settings={{ usage_events: { enabled: true, required: true } }} />);
    expect(screen.getByText('1 of 2 active')).toBeTruthy();
    expect(screen.getByText('Not collected (1)')).toBeTruthy();
  });

  test('summarizes the exact enabled Health Connect scope in participant-facing labels', () => {
    render(
      <CollectionModulesPanel
        modules={[HEALTH_MODULE]}
        settings={{ health_connect: { enabled: true, healthConnectRecordTypes: ['steps', 'heart_rate', 'sleep'] } }}
      />,
    );
    expect(screen.getByText('Health Connect scope (3)')).toBeTruthy();
    expect(screen.getByText('Steps')).toBeTruthy();
    expect(screen.getByText('Heart rate')).toBeTruthy();
    expect(screen.getByText('Sleep sessions and stages')).toBeTruthy();
  });

  test('flags an enabled Health Connect module with an empty scope instead of implying health data is collected', () => {
    render(
      <CollectionModulesPanel
        modules={[HEALTH_MODULE]}
        settings={{ health_connect: { enabled: true, healthConnectRecordTypes: [] } }}
      />,
    );
    expect(screen.getByText(/No Health Connect record types are selected/)).toBeTruthy();
    expect(screen.getByText(/app requests no Health Connect data/)).toBeTruthy();
  });

  test('preserves and labels an unrecognized future Health Connect record type', () => {
    render(
      <CollectionModulesPanel
        modules={[HEALTH_MODULE]}
        settings={{ health_connect: { enabled: true, healthConnectRecordTypes: ['future_metric'] } }}
      />,
    );
    expect(screen.getByText('Future Metric')).toBeTruthy();
  });
});
