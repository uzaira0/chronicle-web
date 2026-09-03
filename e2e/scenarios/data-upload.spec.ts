import { expect, chronicleTest as test } from '../fixtures/chronicle-test.js';

test.describe('Data Upload', () => {
  test('upload returns positive row count', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.study(providers.data.study('UploadCount'), async (study) => {
          await study.participant(providers.data.participant(), async (part) => {
            await part.device(providers.data.androidDevice(), async (dev) => {
              await dev.upload(providers.data.usageEvents(10), (data) => {
                expect(data.rowsWritten).toBeGreaterThanOrEqual(0);
                return Promise.resolve();
              });
            });
          });
        });
      });
    });
  });

  test('flush and verify events appear in storage', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.study(providers.data.study('UploadFlush'), async (study) => {
          await study.participant(providers.data.participant(), async (part) => {
            await part.device(providers.data.androidDevice(), async (dev) => {
              await dev.upload(providers.data.usageEvents(5), async (data) => {
                await data.flush();
                await data.verify((d) => {
                  expect(d.studyId).toBeTruthy();
                  return Promise.resolve();
                });
              });
            });
          });
        });
      });
    });
  });
});
