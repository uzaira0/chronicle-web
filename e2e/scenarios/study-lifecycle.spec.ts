import { HEADER_CSRF_TOKEN } from '../dsl/constants.js';
import { type ApiClient, currentCsrfToken } from '../dsl/di/api-client.js';
import { expect, chronicleTest as test } from '../fixtures/chronicle-test.js';

test.describe('Study Lifecycle', () => {
  test('create and retrieve study', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        const spec = providers.data.study('Lifecycle');
        await auth.study(spec, (study) => {
          expect(study.id).toBeTruthy();
          return Promise.resolve();
        });
      });
    });
  });

  test('cleanup deletes the study on scenario completion', async ({ scenario, providers }) => {
    const captured: { client?: ApiClient; studyId?: string } = {};

    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.study(providers.data.study('CleanupVerify'), (study) => {
          captured.client = auth.client;
          captured.studyId = study.id;
          return Promise.resolve();
        });
      });
    });

    const { client, studyId } = captured;
    if (!client || !studyId) {
      throw new Error('Scenario did not capture the created study and authenticated client.');
    }

    const response = await client.request.get(`${client.baseUrl}/chronicle/v3/study/${encodeURIComponent(studyId)}`, {
      headers: {
        [HEADER_CSRF_TOKEN]: await currentCsrfToken(client.context),
      },
    });

    expect([403, 404]).toContain(response.status());
  });
});
