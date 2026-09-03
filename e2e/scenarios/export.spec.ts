import { ExportAssertions } from '../dsl/assertions/export-assertions.js';
import { expect, chronicleTest as test } from '../fixtures/chronicle-test.js';

test.describe('Async Export', () => {
  test('export completes and download returns CSV', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('ExportCSV'), async (study) => {
          const participant = providers.data.participant();
          await study.participant(participant, async (part) => {
            await part.device(providers.data.androidDevice(), async (dev) => {
              await dev.upload(providers.data.usageEvents(10), async (data) => {
                await data.flush();
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
              ExportAssertions.assertCsvHasRows(bytes, 1);
            },
          );
        });
      });
    });
  });
});
