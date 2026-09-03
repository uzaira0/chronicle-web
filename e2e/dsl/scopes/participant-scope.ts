import type { BrowserContext } from '@playwright/test';
import type { ApiClient } from '../di/api-client.js';
import { apiPost } from '../di/api-client.js';
import type { ScenarioContext } from '../scenario-context.js';
import { DeviceScope } from './device-scope.js';
import type { DeviceSpec } from '../di/test-data-provider.js';
import { runPersona, type PersonaName, type PersonaScope } from './persona-scope.js';

export class ParticipantScope {
  readonly ctx: ScenarioContext;
  readonly userId: string;
  readonly client: ApiClient;
  readonly context: BrowserContext;
  readonly studyId: string;
  readonly participantId: string;

  constructor(
    ctx: ScenarioContext,
    userId: string,
    client: ApiClient,
    context: BrowserContext,
    studyId: string,
    participantId: string,
  ) {
    this.ctx = ctx;
    this.userId = userId;
    this.client = client;
    this.context = context;
    this.studyId = studyId;
    this.participantId = participantId;
  }

  async device(
    spec: DeviceSpec = this.ctx.providers.data.androidDevice(),
    block: (device: DeviceScope) => Promise<void>,
  ): Promise<void> {
    await apiPost<string>(
      this.client,
      `/chronicle/v3/study/${this.studyId}/participant/${this.participantId}/${spec.deviceId}/enroll`,
      {
        // Backend SourceDevice is sealed/polymorphic with @class discriminator.
        // AndroidDevice requires: device, model, codename, brand, osVersion, sdkVersion, product, deviceId.
        '@class': 'com.openlattice.chronicle.sources.AndroidDevice',
        device: spec.model,
        model: spec.model,
        codename: spec.model,
        brand: spec.manufacturer,
        osVersion: spec.osVersion,
        sdkVersion: '33',
        product: spec.model,
        deviceId: spec.deviceId,
      }
    );
    await block(new DeviceScope(
      this.ctx,
      this.client,
      this.studyId,
      this.participantId,
      spec.deviceId,
    ));
  }

  async asPersona(
    name: PersonaName,
    block: (persona: PersonaScope) => Promise<void>,
  ): Promise<void> {
    await runPersona(
      this.ctx,
      name,
      this.context,
      this.client,
      { studyId: this.studyId, participantId: this.participantId },
      block,
    );
  }
}
