import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Date arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid YYYY-MM-DD date string (day capped at 28 to avoid invalid month/day combos). */
export const validIsoDateArb = fc
  .tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

/** Generates a valid ISO 8601 datetime string with optional timezone suffix. */
export const validIsoDateTimeArb = fc
  .tuple(
    validIsoDateArb,
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
    fc.option(fc.constantFrom('Z', '+00:00', '-05:00', '+05:30'), { nil: undefined }),
  )
  .map(([date, h, m, s, tz]) => {
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return tz ? `${date}T${time}${tz}` : `${date}T${time}`;
  });

// ---------------------------------------------------------------------------
// Email arbitrary
// ---------------------------------------------------------------------------

/** Generates a syntactically valid email address (local@domain.tld). */
export const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z0-9._%+-]{1,20}$/),
    fc.stringMatching(/^[a-zA-Z0-9-]{1,15}$/),
    fc.stringMatching(/^[a-zA-Z]{2,6}$/),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// ---------------------------------------------------------------------------
// UUID arbitrary
// ---------------------------------------------------------------------------

/** Generates a valid v4 UUID string. */
export const validUuidArb = fc.uuid();
