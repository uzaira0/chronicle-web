import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ParticipantSchema, StudySchema, UsageEventSchema } from '../state/zod-schemas';

// ---------------------------------------------------------------------------
// Fixture loader — reads shared parity fixtures from the monorepo root
// ---------------------------------------------------------------------------

function loadFixture(name: string): unknown {
  // From chronicle-web/ to monorepo root: ../tests/parity/fixtures/
  const fixtureDir = resolve(__dirname, '../../../../tests/parity/fixtures');
  const raw = readFileSync(resolve(fixtureDir, name), 'utf-8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Study parity tests
// ---------------------------------------------------------------------------

describe('Parity — Study fixtures', () => {
  it('valid study fixture passes schema validation', () => {
    const data = loadFixture('study.valid.json');
    const result = StudySchema.safeParse(data);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.title).toBe('Sleep Patterns Study');
      expect(result.data.contact).toBe('researcher@university.edu');
      expect(result.data.lat).toBeCloseTo(37.4275);
      expect(result.data.lon).toBeCloseTo(-122.1697);
      expect(result.data.group).toBe('neuroscience');
      expect(result.data.version).toBe('1.0');
    }
  });

  it('valid study fixture round-trips through JSON', () => {
    const data = loadFixture('study.valid.json');
    const parsed = StudySchema.parse(data);
    const serialized = JSON.stringify(parsed);
    const reparsed = StudySchema.parse(JSON.parse(serialized));

    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.contact).toBe(parsed.contact);
    expect(reparsed.lat).toBeCloseTo(parsed.lat);
    expect(reparsed.lon).toBeCloseTo(parsed.lon);
  });

  it('invalid UUID study fixture fails schema validation', () => {
    const data = loadFixture('study.invalid-uuid.json');
    const result = StudySchema.safeParse(data);
    expect(result.success).toBe(false);

    if (!result.success) {
      const idErrors = result.error.issues.filter((i) => i.path.includes('id'));
      expect(idErrors.length).toBeGreaterThan(0);
    }
  });

  it('missing-required study fixture fails schema validation', () => {
    const data = loadFixture('study.missing-required.json');
    const result = StudySchema.safeParse(data);
    expect(result.success).toBe(false);

    if (!result.success) {
      const titleErrors = result.error.issues.filter((i) => i.path.includes('title'));
      expect(titleErrors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Participant parity tests
// ---------------------------------------------------------------------------

describe('Parity — Participant fixtures', () => {
  it('valid participant fixture passes schema validation', () => {
    const data = loadFixture('participant.valid.json');
    const result = ParticipantSchema.safeParse(data);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.participantId).toBe('p-sleep-001');
      expect(result.data.participationStatus).toBe('ENROLLED');
      expect(result.data.participantNotes).toBe('Completed initial screening');
      expect(result.data.participantTags).toContain('control');
      expect(result.data.participantTags).toContain('wave-1');
    }
  });

  it('valid participant fixture round-trips through JSON', () => {
    const data = loadFixture('participant.valid.json');
    const parsed = ParticipantSchema.parse(data);
    const serialized = JSON.stringify(parsed);
    const reparsed = ParticipantSchema.parse(JSON.parse(serialized));

    expect(reparsed.participantId).toBe(parsed.participantId);
    expect(reparsed.participationStatus).toBe(parsed.participationStatus);
    expect(reparsed.participantNotes).toBe(parsed.participantNotes);
    expect(reparsed.participantTags).toEqual(parsed.participantTags);
  });

  it('invalid participation status fails schema validation', () => {
    const data = loadFixture('participant.invalid-status.json');
    const result = ParticipantSchema.safeParse(data);
    expect(result.success).toBe(false);

    if (!result.success) {
      const statusErrors = result.error.issues.filter((i) => i.path.includes('participationStatus'));
      expect(statusErrors.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// UsageEvent parity tests
// ---------------------------------------------------------------------------

describe('Parity — UsageEvent fixtures', () => {
  it('valid usage event fixture passes schema validation', () => {
    const data = loadFixture('usage-event.valid.json');
    const result = UsageEventSchema.safeParse(data);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.appPackageName).toBe('com.example.app');
      expect(result.data.interactionType).toBe('MOVE_TO_FOREGROUND');
      expect(result.data.users).toContain('participant-001');
    }
  });

  it('invalid timestamp usage event fails schema validation', () => {
    const data = loadFixture('usage-event.invalid-timestamp.json');
    const result = UsageEventSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('invalid type usage event fails schema validation', () => {
    const data = loadFixture('usage-event.invalid-type.json');
    const result = UsageEventSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
