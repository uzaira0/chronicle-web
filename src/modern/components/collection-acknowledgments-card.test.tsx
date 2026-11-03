import { expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { AcknowledgmentsCard } from './collection-acknowledgments-card';

test('collection acknowledgments show the producer version and protect participant identifiers', () => {
  render(
    <AcknowledgmentsCard
      entries={[
        {
          id: 'ack',
          studyId: 'study',
          acknowledgedAt: '2026-10-31T12:00:00Z',
          recordedAt: '2026-10-31T12:00:00Z',
          participantId: 'word-like-id',
          acknowledgedModules: [],
          sourceRandomDeviceId: 'device',
          appVersion: '81.2',
        },
      ]}
    />,
  );
  expect(screen.getByText('81.2')).toBeTruthy();
  expect(screen.getByText('word-like-id').closest('td')?.getAttribute('translate')).toBe('no');
});
