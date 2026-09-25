import { describe, expect, mock, test } from 'bun:test';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { Table, TableBody } from '@/components/ui/table';

// Every ParticipantRow body renders exactly one activity cell, so counting the cell's renders
// counts row re-renders. The wrapper delegates to the real cell, so other tests are unaffected.
let activityCellRenders = 0;
// Bind the real function first: mock.module rewrites the live module namespace in place.
const { ParticipantActivityCell: RealActivityCell } = await import('@/components/participant-activity-cell');
await mock.module('@/components/participant-activity-cell', () => ({
  ParticipantActivityCell: (props: Parameters<typeof RealActivityCell>[0]) => {
    activityCellRenders += 1;
    return RealActivityCell(props);
  },
}));
const { ParticipantRow } = await import('./study-participants-page');

const mockParticipant = {
  candidate: { id: 'test-c-1' },
  participantId: 'test-p-1',
  participationStatus: 'ENROLLED' as const,
  participantNotes: 'Some notes',
  participantTags: ['tag1'],
  enrollmentDate: '2023-01-01',
};

describe('StudyParticipantsPage - Accessibility', () => {
  test('ParticipantRow has correct ARIA labels', () => {
    render(
      <Table>
        <TableBody>
          <ParticipantRow
            colCount={11}
            handleSingleDelete={() => {}}
            hardwareSensorsEnabled={false}
            hasTud={false}
            isExpanded={false}
            isSelected={false}
            participant={mockParticipant}
            participantAcknowledgments={[]}
            participantDevices={[]}
            participantSensors={[]}
            selectedAndroidSensors={[]}
            setModal={() => {}}
            toggleExpanded={() => {}}
            toggleSelected={() => {}}
          />
        </TableBody>
      </Table>,
    );

    const checkbox = screen.getByLabelText(/select participant test-p-1/i);
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute('type')).toBe('checkbox');

    const expandBtn = screen.getByLabelText(/expand row/i);
    expect(expandBtn).toBeTruthy();
  });

  // design-review DR4 (WCAG 2.5.5 AAA): the 16px checkbox and the chevron get a 44px hit area.
  test('ParticipantRow controls have 44px targets', () => {
    render(
      <Table>
        <TableBody>
          <ParticipantRow
            colCount={11}
            handleSingleDelete={() => {}}
            hardwareSensorsEnabled={false}
            hasTud={false}
            isExpanded={false}
            isSelected={false}
            participant={mockParticipant}
            participantAcknowledgments={[]}
            participantDevices={[]}
            participantSensors={[]}
            selectedAndroidSensors={[]}
            setModal={() => {}}
            toggleExpanded={() => {}}
            toggleSelected={() => {}}
          />
        </TableBody>
      </Table>,
    );
    const target = (element: Element | null) => (element?.className ?? '').split(/\s+/);
    const checkboxHitArea = screen.getByLabelText(/select participant test-p-1/i).closest('label');
    for (const element of [checkboxHitArea, screen.getByLabelText(/expand row/i)]) {
      expect(target(element)).toContain('min-h-11');
      expect(target(element)).toContain('min-w-11');
    }
  });

  test('ParticipantRow has collapse label when expanded', () => {
    render(
      <Table>
        <TableBody>
          <ParticipantRow
            colCount={11}
            handleSingleDelete={() => {}}
            hardwareSensorsEnabled={false}
            hasTud={false}
            isExpanded={true}
            isSelected={false}
            participant={mockParticipant}
            participantAcknowledgments={[]}
            participantDevices={[]}
            participantSensors={[]}
            selectedAndroidSensors={[]}
            setModal={() => {}}
            toggleExpanded={() => {}}
            toggleSelected={() => {}}
          />
        </TableBody>
      </Table>,
    );

    expect(screen.getByLabelText(/collapse row/i)).toBeTruthy();
  });

  test('ParticipantRow shows iOS upload status when expanded', () => {
    render(
      <Table>
        <TableBody>
          <ParticipantRow
            colCount={11}
            handleSingleDelete={() => {}}
            hardwareSensorsEnabled={false}
            hasTud={false}
            iosUploadStatus={{
              bufferedBatches: 2,
              bufferedRecords: 7,
              committedRows: 166,
              lastBufferedUploadAt: '2026-06-25T03:45:00Z',
              lastCommittedAt: '2026-06-25T03:44:00Z',
              lastObservationEndAt: '2026-06-25T03:40:00Z',
              participantId: 'test-p-1',
            }}
            isExpanded={true}
            isSelected={false}
            participant={mockParticipant}
            participantAcknowledgments={[]}
            participantDevices={[{ deviceType: 'Ios' }]}
            participantSensors={[]}
            selectedAndroidSensors={[]}
            setModal={() => {}}
            toggleExpanded={() => {}}
            toggleSelected={() => {}}
          />
        </TableBody>
      </Table>,
    );

    expect(screen.getByText('iOS Upload Status')).toBeTruthy();
    expect(screen.getByText('166')).toBeTruthy();
    expect(screen.getByText('7 rows / 2 batches')).toBeTruthy();
    expect(screen.getByText(/Latest buffered upload received/)).toBeTruthy();
  });
});

// production-readiness F6: toggling one row of a long table must re-render only that row.
describe('StudyParticipantsPage - row re-renders', () => {
  const EMPTY: never[] = [];
  const participants = Array.from({ length: 500 }, (_, index) => ({
    candidate: { id: `c-${index}` },
    participantId: `p-${index}`,
    participationStatus: 'ENROLLED' as const,
    participantTags: EMPTY,
  }));
  const noop = () => {};

  function Harness() {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    // Same shape as the page: a stable functional-update callback.
    const toggleSelected = useCallback((id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);
    return (
      <Table>
        <TableBody>
          {participants.map((participant) => (
            <ParticipantRow
              colCount={11}
              handleSingleDelete={noop}
              hardwareSensorsEnabled={false}
              hasTud={false}
              isExpanded={false}
              isSelected={selected.has(participant.participantId)}
              key={participant.participantId}
              participant={participant}
              participantAcknowledgments={EMPTY}
              participantDevices={EMPTY}
              participantSensors={EMPTY}
              selectedAndroidSensors={EMPTY}
              setModal={noop}
              toggleExpanded={noop}
              toggleSelected={toggleSelected}
            />
          ))}
        </TableBody>
      </Table>
    );
  }

  test('selecting one of 500 rows re-renders that row alone', () => {
    render(<Harness />);
    expect(activityCellRenders).toBeGreaterThanOrEqual(500);
    activityCellRenders = 0;
    act(() => {
      fireEvent.click(screen.getByLabelText('Select participant p-250'));
    });
    expect(screen.getByLabelText<HTMLInputElement>('Select participant p-250').checked).toBe(true);
    expect(activityCellRenders).toBe(1);
  });
});
