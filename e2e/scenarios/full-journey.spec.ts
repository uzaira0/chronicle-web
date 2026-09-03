import { ExportAssertions } from '../dsl/assertions/export-assertions.js';
import { expect, chronicleTest as test } from '../fixtures/chronicle-test.js';

test.describe('Full Journey', () => {
  test('full participant journey - auth to export', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('FullJourney'), async (study) => {
          const participant = providers.data.participant();

          await study.participant(participant, async (part) => {
            const device = providers.data.androidDevice();
            await part.device(device, async (dev) => {
              await dev.upload(providers.data.usageEvents(25), async (data) => {
                expect(data.rowsWritten).toBeGreaterThanOrEqual(0);
                await data.flush();
                await data.verify((d) => {
                  expect(d.studyId).toBeTruthy();
                  expect(d.participantId).toBe(participant.participantId);
                  return Promise.resolve();
                });
              });
            });
          });

          await study.export(
            { dataTypes: ['UsageEvents'], participantIds: [participant.participantId], format: 'CSV' },
            async (exp) => {
              const info = await exp.awaitCompletion({ timeoutMs: 30_000, intervalMs: 200 });
              expect(info.status).toBe('COMPLETED');
              const bytes = await exp.download();
              expect(bytes.length).toBeGreaterThan(0);
              ExportAssertions.assertCsvHasRows(bytes, 25);
            },
          );
        });
      });
    });
  });
});
