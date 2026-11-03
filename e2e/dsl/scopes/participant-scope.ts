import { randomBytes } from 'node:crypto';
import { type BrowserContext, request } from '@playwright/test';
import { COLLECTION_MODULES } from '../../../src/modern/lib/study-constants';
import type { components } from '../../../src/modern/types/chronicle-api.generated';
import type { ApiClient } from '../di/api-client.js';
import { apiGet, apiPost } from '../di/api-client.js';
import type { DeviceSpec } from '../di/test-data-provider.js';
import MOBILE_HEADERS from '../mobile-headers.json';
import type { ScenarioContext } from '../scenario-context.js';
import { DeviceScope } from './device-scope.js';
import { type PersonaName, type PersonaScope, runPersona } from './persona-scope.js';

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
    await block(await this.enrollDevice(spec));
  }

  private async enrollDevice(spec: DeviceSpec): Promise<DeviceScope> {
    const mobileRequest = await request.newContext();
    this.ctx.pushCleanup(() => mobileRequest.dispose());
    const mobileClient = { ...this.client, request: mobileRequest };
    const mobile = `/chronicle/v4/study/${this.studyId}/participant/${this.participantId}`;
    const invitation = await apiPost<{ accessCode: string }>(
      this.client,
      `/chronicle/v3/study/${this.studyId}/participant/${this.participantId}/form-access-codes`,
      { formKind: 'ENROLLMENT' },
    );
    const headers = {
      [MOBILE_HEADERS.randomDeviceId]: spec.randomDeviceId,
      [MOBILE_HEADERS.enrollmentCode]: invitation.accessCode,
    };
    const preview = await apiGet<components['schemas']['EnrollmentPreviewResponse']>(
      mobileClient,
      `${mobile}/enrollment-preview`,
      headers,
    );
    const secret = randomBytes(16).toString('hex');
    const proposedApiKey = `ck_${secret.slice(0, 8)}_${secret}`;
    const enrolled = await apiPost<components['schemas']['EnrollmentResponse']>(
      mobileClient,
      `${mobile}/enroll`,
      {
        // Backend SourceDevice is sealed/polymorphic with @class discriminator.
        // AndroidDevice requires: device, model, codename, brand, osVersion, sdkVersion, product, randomDeviceId.
        '@class': 'com.openlattice.chronicle.sources.AndroidDevice',
        device: spec.model,
        model: spec.model,
        codename: spec.model,
        brand: spec.manufacturer,
        osVersion: spec.osVersion,
        sdkVersion: '33',
        product: spec.model,
        randomDeviceId: spec.randomDeviceId,
      },
      {
        ...headers,
        [MOBILE_HEADERS.manifestDigest]: preview.manifestDigest,
        [MOBILE_HEADERS.enrollmentAttemptId]: crypto.randomUUID(),
        [MOBILE_HEADERS.proposedApiKey]: proposedApiKey,
      },
    );
    if (enrolled.apiKey !== proposedApiKey) throw new Error('Enrollment did not bind the proposed device credential');
    const deviceHeaders = { [MOBILE_HEADERS.randomDeviceId]: spec.randomDeviceId, [MOBILE_HEADERS.apiKey]: proposedApiKey };
    await apiPost(
      mobileClient,
      `${mobile}/android/collection-ack`,
      {
        acknowledgedModules: COLLECTION_MODULES.filter(
          ({ value }) => preview.manifest.collectionSettings.modules?.[value]?.enabled,
        ).map(({ value }) => value),
        acknowledgedAt: new Date().toISOString(),
        settingsVersion: preview.manifest.settingsVersion,
        disclosureVersion: preview.manifest.participantPolicy.version,
        manifestDigest: preview.manifestDigest,
      },
      deviceHeaders,
    );
    return new DeviceScope(
      this.ctx,
      { researcher: this.client, mobile: mobileClient },
      {
        studyId: this.studyId,
        participantId: this.participantId,
        randomDeviceId: spec.randomDeviceId,
        apiKey: proposedApiKey,
      },
    );
  }

  async asPersona(name: PersonaName, block: (persona: PersonaScope) => Promise<void>): Promise<void> {
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
