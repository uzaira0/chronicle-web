import { afterEach, expect, spyOn, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { ParticipantActivityCell } from './participant-activity-cell';

afterEach(cleanup);

test('compares and displays diary dates on the local calendar', () => {
  const hour = new Date(2024, 5, 23).getTimezoneOffset() < 0 ? 1 : 23;
  const clock = spyOn(Date, 'now').mockReturnValue(new Date(2024, 5, 23, hour).getTime());
  try {
    render(<ParticipantActivityCell hasTud ps={{
      participantId: 'diary-participant',
      studyId: 'study',
      androidUniqueDates: [],
      iosUniqueDates: [],
      tudUniqueDates: ['2024-06-15'],
      tudFirstDate: '2024-06-15',
      tudLastDate: '2024-06-15',
    }} />);
    const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(2024, 5, 15));
    expect(screen.getByText(`${date} → ${date} · idle 8d`)).toBeTruthy();
  } finally {
    clock.mockRestore();
  }
});
