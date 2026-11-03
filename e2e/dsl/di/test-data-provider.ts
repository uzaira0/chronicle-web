import { buildStudyParticipantPolicy } from '../../../src/modern/lib/participant-policy';
import { COLLECTION_MODULES, STUDY_SETTING_CLASSES } from '../../../src/modern/lib/study-constants';
import { participantPolicyFixture } from '../../fixtures/study-form.js';
import { e2eTitle } from '../util/scenario-ids.js';

export interface StudySpec {
  title: string;
  contact?: string;
  settings?: Record<string, unknown>;
  modules?: Record<string, Record<string, unknown>>;
}

export interface ParticipantSpec {
  participantId: string;
}

export interface DeviceSpec {
  model: string;
  manufacturer: string;
  osVersion: string;
  randomDeviceId: string;
}

export interface UsageEventSpec {
  appPackageName: string;
  clientEventId: string;
  interactionType: string;
  timestamp: string;
  timezone: string;
  user: string;
  applicationLabel: string;
}

export interface TestDataProvider {
  study(tag?: string): StudySpec;
  participant(): ParticipantSpec;
  androidDevice(): DeviceSpec;
  usageEvents(count?: number): UsageEventSpec[];
}

export class DefaultTestDataProvider implements TestDataProvider {
  study(tag = 'Test'): StudySpec {
    return {
      title: e2eTitle(tag),
      contact: 'e2e@openlattice.com',
      modules: { CHRONICLE_DATA_COLLECTION: {} },
      settings: {
        DataCollection: {
          '@class': STUDY_SETTING_CLASSES.DataCollection,
          modules: Object.fromEntries(
            COLLECTION_MODULES.map(({ value, defaultEnabled }) => [value, { enabled: defaultEnabled }]),
          ),
        },
        ParticipantPolicy: buildStudyParticipantPolicy(participantPolicyFixture(tag)),
      },
    };
  }

  participant(): ParticipantSpec {
    return { participantId: `p-${crypto.randomUUID().slice(0, 8)}` };
  }

  androidDevice(): DeviceSpec {
    return {
      model: `TestPhone-${crypto.randomUUID().slice(0, 4)}`,
      manufacturer: 'TestMfg',
      osVersion: '13',
      randomDeviceId: `dev-${crypto.randomUUID()}`,
    };
  }

  usageEvents(count = 25): UsageEventSpec[] {
    return Array.from({ length: count }, (_, i) => ({
      appPackageName: `com.test.app${i % 5}`,
      clientEventId: crypto.randomUUID(),
      interactionType: 'Move to Foreground',
      timestamp: new Date(Date.now() - i * 60_000).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user: 'e2e-test-user',
      applicationLabel: `TestApp${i % 5}`,
    }));
  }
}
