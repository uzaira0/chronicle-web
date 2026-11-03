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
                // The receipt names every stored event: all 25 fresh ones.
                expect(data.rowsWritten).toBe(25);
                await data.flush();
              });
            });
          });

          const bytes = await study.exportCsv('UsageEvents', [participant.participantId]);
          ExportAssertions.assertCsvHasRows(bytes, 25);
        });
      });
    });
  });
});
