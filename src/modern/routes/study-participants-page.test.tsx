import { describe, expect, mock, test } from 'bun:test';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { Table, TableBody } from '@/components/ui/table';
import { LanguageProvider } from '@/i18n';
import { formatDisplayDateTime } from '@/lib/format';
import type { ParticipantConsentState } from '@/state/study-operations-api';

// Every ParticipantRow body renders exactly one activity cell, so counting the cell's renders
// counts row re-renders. The wrapper delegates to the real cell, so other tests are unaffected.
let activityCellRenders = 0;
// Bind the real function first: mock.module rewrites the live module namespace in place.
const { ParticipantActivityCell: RealActivityCell } = await import('@/components/participant-activity-cell');
const ParticipantActivityCell = (props: Parameters<typeof RealActivityCell>[0]) => {
  activityCellRenders += 1;
  return RealActivityCell(props);
};
await mock.module('@/components/participant-activity-cell', () => ({
  ParticipantActivityCell,
}));
const AndroidDiagnosticsPanel = () => null;
await mock.module('@/components/android-diagnostics-panel', () => ({ AndroidDiagnosticsPanel }));
const { ParticipantRow } = await import('./study-participants-page');

const mockParticipant = {
  candidate: { id: 'test-c-1' },
  participantId: 'test-p-1',
  participationStatus: 'ENROLLED' as const,
  participantNotes: 'Some notes',
  participantTags: ['tag1'],
  enrollmentDate: '2023-01-01',
};

describe('StudyParticipantsPage - collection state', () => {
  const renderRow = (consentState: ParticipantConsentState) =>
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
            participant={{ ...mockParticipant, consentState }}
            studyId="study-test"
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

  // The server reads the decisions; the row shows its reading instead of a quiet "Enrolled".
  test('an enrolled participant who declined a required data type shows collection stopped and the next step', () => {
    renderRow({ declinedRequiredModules: ['battery_telemetry'], modulesAwaitingDecision: [] });
    expect(screen.queryByText('Enrolled')).toBeNull();
    expect(screen.getByText('Collection stopped')).toBeTruthy();
    expect(screen.getByText(/declined a required data type: Battery Telemetry/)).toBeTruthy();
    expect(screen.getByText(/Data Sharing in the Chronicle app/)).toBeTruthy();
  });

  // The pilot study's required module declined, read by a Spanish-speaking researcher.
  test('a declined required usage module reads as stopped collection with the next step in Spanish', () => {
    const view = render(
      <LanguageProvider initialSearch="?lang=es">
        <Table>
          <TableBody>
            <ParticipantRow
              colCount={11}
              handleSingleDelete={() => {}}
              hardwareSensorsEnabled={false}
              hasTud={false}
              isExpanded={false}
              isSelected={false}
              participant={{
                ...mockParticipant,
                consentState: { declinedRequiredModules: ['usage_events'], modulesAwaitingDecision: [] },
              }}
              studyId="study-test"
              participantAcknowledgments={[]}
              participantDevices={[]}
              participantSensors={[]}
              selectedAndroidSensors={[]}
              setModal={() => {}}
              toggleExpanded={() => {}}
              toggleSelected={() => {}}
            />
          </TableBody>
        </Table>
      </LanguageProvider>,
    );
    try {
      expect(screen.getByText('Recopilación detenida')).toBeTruthy();
      expect(
        screen.getByText(
          /rechazó un tipo de dato obligatorio: Eventos de uso de aplicaciones\. Pídale que lo active en Datos compartidos/,
        ),
      ).toBeTruthy();
      expect(screen.queryByText('Collection stopped')).toBeNull();
    } finally {
      view.unmount();
      render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>).unmount();
    }
  });

  test('an enrolled participant with data types awaiting review says which ones and what to do', () => {
    renderRow({ declinedRequiredModules: [], modulesAwaitingDecision: ['battery_telemetry'] });
    expect(screen.getByText('Enrolled')).toBeTruthy();
    expect(screen.getByText(/Waiting for the participant to review: Battery Telemetry/)).toBeTruthy();
  });

  test('a participant with nothing outstanding stays quietly enrolled', () => {
    renderRow({ declinedRequiredModules: [], modulesAwaitingDecision: [] });
    expect(screen.getByText('Enrolled')).toBeTruthy();
    expect(screen.queryByText(/Waiting for the participant/)).toBeNull();
  });
});

describe('StudyParticipantsPage - Accessibility', () => {
  test('shows a withdrawn participant and the withdrawal date', () => {
    const withdrawnAt = '2026-10-07T14:00:00Z';
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
            participant={{ ...mockParticipant, participationStatus: 'NOT_ENROLLED', withdrawnAt }}
            studyId="study-test"
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
    expect(screen.getByText('Withdrawn')).toBeTruthy();
    expect(screen.getByText(formatDisplayDateTime(withdrawnAt))).toBeTruthy();
  });

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
            studyId="study-test"
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

  // WCAG 2.5.5 AAA: the 16px checkbox and the chevron get a 44px hit area.
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
            studyId="study-test"
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
            studyId="study-test"
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
              committedRows: 166,
              lastCommittedAt: '2026-06-25T03:44:00Z',
              lastObservationEndAt: '2026-06-25T03:40:00Z',
              participantId: 'test-p-1',
            }}
            isExpanded={true}
            isSelected={false}
            participant={mockParticipant}
            studyId="study-test"
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

    expect(screen.getByText('iOS upload status')).toBeTruthy();
    expect(screen.getByText('166')).toBeTruthy();
  });
});

// Toggling one row of a long table must re-render only that row.
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
            studyId="study-test"
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

describe('StudyParticipantsPage - row re-renders', () => {
  test('selecting one of 500 rows re-renders that row alone', () => {
    render(<Harness />);
    expect(activityCellRenders).toBeGreaterThanOrEqual(500);
    activityCellRenders = 0;
    act(() => {
      fireEvent.click(screen.getByLabelText('Select participant p-250'));
    });
    expect(screen.getByLabelText<HTMLInputElement>('Select participant p-250').checked).toBe(true);
    expect(activityCellRenders).toBe(1);
    // The claim is the render count; mounting 500 rows under happy-dom on a loaded host can
    // pass the 5 s default without anything being wrong.
  }, 60_000);
});
