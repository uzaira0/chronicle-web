import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { Table, TableBody } from '@/components/ui/table';
import { ParticipantRow } from './study-participants-page';

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
