import { describe, expect, it } from 'bun:test';

import {
  IOSDeviceSchema,
  PAYLOAD_FIXTURE_REGISTRY,
  PAYLOAD_FIXTURES,
  ScreenTimeUsageEnvelopeSchema,
  SensorDataSampleBatchSchema,
  UserIdentificationEnvelopeSchema,
} from '@/generated/chronicle-payload-contracts.generated';

const fixtures: Readonly<Record<string, unknown>> = PAYLOAD_FIXTURES;
const validatedWireFamilies = [
  {
    family: 'ios-device',
    validFixture: 'fixtures/payloads/ios-device/valid.json',
    parse: (value: unknown) => IOSDeviceSchema.parse(value),
  },
  {
    family: 'ios-sensorkit-data',
    validFixture: 'fixtures/payloads/ios-sensorkit-data/valid.json',
    parse: (value: unknown) => SensorDataSampleBatchSchema.parse(value),
  },
  {
    family: 'screen-time-usage',
    validFixture: 'fixtures/payloads/screen-time-usage/valid.json',
    parse: (value: unknown) => ScreenTimeUsageEnvelopeSchema.parse(value),
  },
  {
    family: 'user-identification',
    validFixture: 'fixtures/payloads/user-identification/valid.json',
    parse: (value: unknown) => UserIdentificationEnvelopeSchema.parse(value),
  },
] as const;

describe('generated canonical payload contracts', () => {
  it('embeds every registry fixture exactly once', () => {
    const declared = PAYLOAD_FIXTURE_REGISTRY.families.flatMap((family) => family.fixtureFiles).sort();
    expect(Object.keys(fixtures).sort()).toEqual(declared);
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('validates every OpenAPI-derived iOS wire family in its explicit scope', () => {
    expect(validatedWireFamilies.map(({ family }) => family)).toEqual([
      'ios-device',
      'ios-sensorkit-data',
      'screen-time-usage',
      'user-identification',
    ]);
    for (const { parse, validFixture } of validatedWireFamilies) {
      parse(fixtures[validFixture]);
    }
  });

  it('rejects canonical invalid iOS wire fixtures', () => {
    expect(() => IOSDeviceSchema.parse(fixtures['fixtures/payloads/ios-device/invalid-missing-class.json'])).toThrow();
    expect(() =>
      SensorDataSampleBatchSchema.parse(fixtures['fixtures/payloads/ios-sensorkit-data/invalid-missing-sensor.json']),
    ).toThrow();
    expect(() =>
      UserIdentificationEnvelopeSchema.parse(
        fixtures['fixtures/payloads/user-identification/invalid-missing-choice.json'],
      ),
    ).toThrow();
  });

  it('rejects unknown enum values independently', () => {
    const screenTime = fixtures['fixtures/payloads/screen-time-usage/valid.json'];
    const malformed = JSON.parse(JSON.stringify(screenTime)) as {
      records: Array<{ source: string }>;
    };
    const firstRecord = malformed.records[0];
    if (!firstRecord) throw new Error('Canonical screen-time fixture must contain a record');
    firstRecord.source = 'unknownSource';
    expect(ScreenTimeUsageEnvelopeSchema.safeParse(malformed).success).toBeFalse();
  });

  it('rejects invalid numeric boundaries independently', () => {
    const screenTime = fixtures['fixtures/payloads/screen-time-usage/valid.json'];
    const malformed = JSON.parse(JSON.stringify(screenTime)) as {
      records: Array<{ durationSeconds: number }>;
    };
    const firstRecord = malformed.records[0];
    if (!firstRecord) throw new Error('Canonical screen-time fixture must contain a record');
    firstRecord.durationSeconds = -1;
    expect(ScreenTimeUsageEnvelopeSchema.safeParse(malformed).success).toBeFalse();
  });

  it('rejects unknown envelope and nested-record fields like the server ObjectMapper', () => {
    const screenTime = fixtures['fixtures/payloads/screen-time-usage/valid.json'];
    const malformedEnvelope = JSON.parse(JSON.stringify(screenTime)) as Record<string, unknown>;
    malformedEnvelope.unexpectedField = true;
    expect(ScreenTimeUsageEnvelopeSchema.safeParse(malformedEnvelope).success).toBeFalse();

    const malformedRecord = JSON.parse(JSON.stringify(screenTime)) as {
      records: Array<Record<string, unknown>>;
    };
    const firstRecord = malformedRecord.records[0];
    if (!firstRecord) throw new Error('Canonical screen-time fixture must contain a record');
    firstRecord.unexpectedField = true;
    expect(ScreenTimeUsageEnvelopeSchema.safeParse(malformedRecord).success).toBeFalse();
  });

  it('derives the SensorKit batch boundaries from OpenAPI', () => {
    const canonicalBatch = fixtures['fixtures/payloads/ios-sensorkit-data/valid.json'] as ReadonlyArray<unknown>;
    const sample = canonicalBatch[0];
    if (!sample) throw new Error('Canonical SensorKit fixture must contain a sample');

    expect(SensorDataSampleBatchSchema.safeParse([]).success).toBeTrue();
    expect(SensorDataSampleBatchSchema.safeParse(Array.from({ length: 10_000 }, () => sample)).success).toBeTrue();
    expect(SensorDataSampleBatchSchema.safeParse(Array.from({ length: 10_001 }, () => sample)).success).toBeFalse();
  });
});
