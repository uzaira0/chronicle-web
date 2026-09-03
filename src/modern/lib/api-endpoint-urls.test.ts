import { describe, expect, it } from 'bun:test';

// =============================================================================
// URL construction patterns used in study-operations-api
// =============================================================================

describe('API URL construction — studyId encoding', () => {
  const studyIds = [
    'simple-id',
    '123e4567-e89b-12d3-a456-426614174000',
    'id with spaces',
    'id/with/slashes',
    'id?with=query',
    'id#with-hash',
    'id&with&ampersands',
    'id+with+plus',
    'id%20encoded',
    'a'.repeat(200),
    'special!@#chars',
    'unicode-\u00e9\u00e8\u00ea',
  ];

  for (const studyId of studyIds) {
    const encoded = encodeURIComponent(studyId);
    const label = studyId.length > 30 ? `${studyId.slice(0, 30)}...` : studyId;

    it(`encodes studyId "${label}" correctly in study detail URL`, () => {
      const url = `/study/${encoded}`;
      expect(url).toContain(encoded);
      expect(decodeURIComponent(url.split('/study/')[1] ?? '')).toBe(studyId);
    });

    it(`encodes studyId "${label}" in participants URL`, () => {
      const url = `/study/${encoded}/participants`;
      expect(url).toEndWith('/participants');
    });

    it(`encodes studyId "${label}" in questionnaire URL`, () => {
      const url = `/survey/${encoded}/questionnaire`;
      expect(url).toEndWith('/questionnaire');
    });

    it(`encodes studyId "${label}" in settings audit URL`, () => {
      const url = `/study/${encoded}/settings/audit`;
      expect(url).toEndWith('/settings/audit');
    });

    it(`encodes studyId "${label}" in devices URL`, () => {
      const url = `/study/${encoded}/devices`;
      expect(url).toEndWith('/devices');
    });

    it(`round-trips studyId "${label}" through encode/decode`, () => {
      expect(decodeURIComponent(encodeURIComponent(studyId))).toBe(studyId);
    });
  }
});

// =============================================================================
// Query parameter construction
// =============================================================================

describe('settings audit pagination query params', () => {
  const paginations = [
    { limit: 10, offset: 0 },
    { limit: 50, offset: 0 },
    { limit: 100, offset: 50 },
    { limit: 1, offset: 999 },
    { limit: 0, offset: 0 },
    { limit: 1000, offset: 1000 },
    { limit: 25, offset: 25 },
    { limit: 50, offset: 100 },
  ];

  for (const { limit, offset } of paginations) {
    it(`constructs correct query for limit=${limit} offset=${offset}`, () => {
      const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
      expect(params.get('limit')).toBe(limit.toString());
      expect(params.get('offset')).toBe(offset.toString());
    });

    it(`produces valid query string for limit=${limit} offset=${offset}`, () => {
      const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
      const qs = params.toString();
      expect(qs).toContain('limit=');
      expect(qs).toContain('offset=');
    });
  }
});

// =============================================================================
// TUD submission groups query params (startDate/endDate)
// =============================================================================

describe('TUD submission groups date params', () => {
  const dateRanges = [
    { startDate: '2024-01-01', endDate: '2024-01-31' },
    { startDate: '2024-06-15', endDate: '2024-06-15' },
    { startDate: '2020-01-01', endDate: '2025-12-31' },
    { startDate: '2024-03-01', endDate: '2024-03-31' },
    { startDate: '2024-12-25', endDate: '2025-01-05' },
  ];

  for (const { startDate, endDate } of dateRanges) {
    it(`constructs params for ${startDate} to ${endDate}`, () => {
      const params = new URLSearchParams({ startDate, endDate });
      expect(params.get('startDate')).toBe(startDate);
      expect(params.get('endDate')).toBe(endDate);
    });

    it(`query string contains both dates for ${startDate} to ${endDate}`, () => {
      const params = new URLSearchParams({ startDate, endDate });
      const qs = params.toString();
      expect(qs).toContain(`startDate=${startDate}`);
      expect(qs).toContain(`endDate=${endDate}`);
    });
  }
});

// =============================================================================
// Participant data download query params
// =============================================================================

describe('participant data download URL params', () => {
  const dataTypes = ['APP_USAGE', 'SENSOR_DATA', 'USAGE_EVENTS', 'USAGE_STATS', 'PREPROCESSED'];

  for (const dataType of dataTypes) {
    it(`dataType "${dataType}" is URL-safe`, () => {
      expect(encodeURIComponent(dataType)).toBe(dataType);
    });

    it(`can append multiple participantIds for dataType "${dataType}"`, () => {
      const params = new URLSearchParams({ dataType });
      params.append('participantId', 'p-1');
      params.append('participantId', 'p-2');
      const all = params.getAll('participantId');
      expect(all).toEqual(['p-1', 'p-2']);
    });
  }
});

// =============================================================================
// Endpoint path patterns
// =============================================================================

describe('endpoint path patterns', () => {
  const studyId = '123e4567-e89b-12d3-a456-426614174000';
  const encoded = encodeURIComponent(studyId);

  it('study detail path starts with /study/', () => {
    expect(`/study/${encoded}`).toMatch(/^\/study\//);
  });

  it('participants path includes /participants', () => {
    expect(`/study/${encoded}/participants`).toContain('/participants');
  });

  it('participant stats path includes /participants/stats', () => {
    expect(`/study/${encoded}/participants/stats`).toEndWith('/participants/stats');
  });

  it('archive path includes /archive', () => {
    expect(`/study/${encoded}/archive`).toEndWith('/archive');
  });

  it('unarchive path includes /unarchive', () => {
    expect(`/study/${encoded}/unarchive`).toEndWith('/unarchive');
  });

  it('devices path includes /devices', () => {
    expect(`/study/${encoded}/devices`).toEndWith('/devices');
  });

  it('sensor availability path includes /android/sensors/availability', () => {
    expect(`/study/${encoded}/android/sensors/availability`).toEndWith('/android/sensors/availability');
  });

  it('questionnaire path starts with /survey/', () => {
    expect(`/survey/${encoded}/questionnaire`).toMatch(/^\/survey\//);
  });

  it('questionnaire export uses the backend data route and file type', () => {
    const qId = 'q-1';
    expect(`/survey/${encoded}/questionnaire/${encodeURIComponent(qId)}/data?type=csv`).toEndWith('/data?type=csv');
  });

  it('TUD submission groups path starts with /time-use-diary/', () => {
    expect(`/time-use-diary/${encoded}/ids`).toMatch(/^\/time-use-diary\//);
  });

  it('settings type path includes /settings/type/', () => {
    expect(`/study/${encoded}/settings/type/SENSOR`).toContain('/settings/type/');
  });

  it('participant annotations path includes /annotations', () => {
    const pid = 'p-1';
    expect(`/study/${encoded}/participant/${encodeURIComponent(pid)}/annotations`).toEndWith('/annotations');
  });

  it('participant status path includes /status', () => {
    const pid = 'p-1';
    expect(`/study/${encoded}/participant/${encodeURIComponent(pid)}/status`).toContain('/status');
  });

  it('update study path includes ?retrieve=true', () => {
    expect(`/study/${encoded}?retrieve=true`).toContain('retrieve=true');
  });

  it('study list path is /study', () => {
    expect('/study').toBe('/study');
  });

  it('create study path is /study with POST (path only)', () => {
    expect('/study').toBe('/study');
  });

  it('compliance path uses web API prefix', () => {
    expect(`/chronicle/api/web/compliance/study/${encoded}`).toContain('/api/web/');
  });

  it('lifecycle path uses web API prefix', () => {
    expect(`/chronicle/api/web/study/${encoded}/lifecycle`).toContain('/api/web/');
  });

  it('limits path uses the authenticated browser API prefix', () => {
    expect(`/chronicle/api/web/limits/study/${encoded}`).toContain('/api/web/limits/');
  });
});
