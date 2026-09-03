import { describe, expect, it } from 'bun:test';
import { getEndOfDayIso, getStartOfDayIso } from './format';

describe('format function snapshots', () => {
  const dates = ['2024-01-01', '2024-06-15', '2024-12-31', '2020-02-29', '1999-12-31'];

  for (const date of dates) {
    it(`getStartOfDayIso('${date}')`, () => {
      expect(getStartOfDayIso(date)).toMatchSnapshot();
    });
    it(`getEndOfDayIso('${date}')`, () => {
      expect(getEndOfDayIso(date)).toMatchSnapshot();
    });
  }

  it('getStartOfDayIso returns ISO string with T00:00:00', () => {
    expect(getStartOfDayIso('2024-07-04')).toMatchSnapshot();
  });

  it('getEndOfDayIso returns ISO string with T23:59:59', () => {
    expect(getEndOfDayIso('2024-07-04')).toMatchSnapshot();
  });

  it('getStartOfDayIso with edge date 2000-01-01', () => {
    expect(getStartOfDayIso('2000-01-01')).toMatchSnapshot();
  });

  it('getEndOfDayIso with edge date 2000-01-01', () => {
    expect(getEndOfDayIso('2000-01-01')).toMatchSnapshot();
  });
});
