import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { COLLECTION_MODULE_ID } from '@/generated/chronicle-contracts';
import { COLLECTION_MODULES } from '@/lib/study-constants';

import { CollectionModulesPanel } from './collection-modules-panel';

afterEach(cleanup);

const MODULES = COLLECTION_MODULES.filter(
  ({ value }) => value === COLLECTION_MODULE_ID.usage_events || value === COLLECTION_MODULE_ID.device_lifecycle,
);

const HEALTH_MODULES = COLLECTION_MODULES.filter(({ value }) => value === COLLECTION_MODULE_ID.health_connect);

describe('CollectionModulesPanel Play Store availability', () => {
  test.each([true, false])('warns next to Health Connect when enabled is %s', (enabled) => {
    render(<CollectionModulesPanel modules={HEALTH_MODULES} settings={{ health_connect: { enabled } }} />);
    expect(
      screen.getAllByText(
        'Not available on this build of the Play Store app. Participants using it cannot enroll while this is on.',
      ),
    ).toHaveLength(1);
  });

  test('does not warn for Play Store app usage collection', () => {
    render(<CollectionModulesPanel modules={MODULES} settings={{ usage_events: { enabled: true } }} />);
    expect(screen.queryByText(/Not available on this build of the Play Store app/)).toBeNull();
  });
});

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

  test('summarizes Android defaults for sparse settings without changing the setting', () => {
    const settings = { usage_events: { enabled: true, required: true } };
    render(<CollectionModulesPanel modules={MODULES} settings={settings} />);
    expect(screen.getByText('2 of 2 active')).toBeTruthy();
    expect(screen.queryByText('Not collected (1)')).toBeNull();
    expect(settings).not.toHaveProperty(COLLECTION_MODULE_ID.device_lifecycle);
  });

  test('preserves an explicit opt-out of a default-enabled module', () => {
    render(<CollectionModulesPanel modules={MODULES} settings={{ device_lifecycle: { enabled: false } }} />);
    expect(screen.getByText('1 of 2 active')).toBeTruthy();
    expect(screen.getByText('Not collected (1)')).toBeTruthy();
  });

  test('missing settings enable no sensor or other opt-in module', () => {
    const modules = COLLECTION_MODULES.filter(({ defaultEnabled }) => !defaultEnabled);
    render(<CollectionModulesPanel modules={modules} settings={{}} />);
    expect(screen.getByText(`0 of ${modules.length} active`)).toBeTruthy();
    expect(screen.getByText(`Not collected (${modules.length})`)).toBeTruthy();
  });

  test('feature-off settings keep default-enabled modules stopped', () => {
    const settings = Object.fromEntries(MODULES.map(({ value }) => [value, { enabled: false }]));
    render(<CollectionModulesPanel modules={MODULES} settings={settings} />);
    expect(screen.getByText('0 of 2 active')).toBeTruthy();
    expect(screen.getByText('Not collected (2)')).toBeTruthy();
  });

  test('summarizes the exact enabled Health Connect scope in participant-facing labels', () => {
    render(
      <CollectionModulesPanel
        modules={HEALTH_MODULES}
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
        modules={HEALTH_MODULES}
        settings={{ health_connect: { enabled: true, healthConnectRecordTypes: [] } }}
      />,
    );
    expect(screen.getByText(/No Health Connect record types are selected/)).toBeTruthy();
    expect(screen.getByText(/app requests no Health Connect data/)).toBeTruthy();
  });

  test('preserves and labels an unrecognized future Health Connect record type', () => {
    render(
      <CollectionModulesPanel
        modules={HEALTH_MODULES}
        settings={{ health_connect: { enabled: true, healthConnectRecordTypes: ['future_metric'] } }}
      />,
    );
    expect(screen.getByText('Future Metric')).toBeTruthy();
  });
});
