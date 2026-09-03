import { e2eTitle } from '../util/scenario-ids.js';

export interface StudySpec {
  title: string;
  contact?: string;
}

export interface ParticipantSpec {
  participantId: string;
}

export interface DeviceSpec {
  model: string;
  manufacturer: string;
  osVersion: string;
  deviceId: string;
}

export interface UsageEventSpec {
  appPackageName: string;
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
      deviceId: `dev-${crypto.randomUUID()}`,
    };
  }

  usageEvents(count = 25): UsageEventSpec[] {
    return Array.from({ length: count }, (_, i) => ({
      appPackageName: `com.test.app${i % 5}`,
      interactionType: 'Move to Foreground',
      timestamp: new Date(Date.now() - i * 60_000).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user: 'e2e-test-user',
      applicationLabel: `TestApp${i % 5}`,
    }));
  }
}
