import { chronicleTest as test, expect } from '../fixtures/chronicle-test.js';

test.describe('Enrollment', () => {
  test('participant and device enroll successfully', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.study(providers.data.study('Enroll'), async (study) => {
          await study.participant(providers.data.participant(), async (part) => {
            expect(part.participantId).toBeTruthy();
            await part.device(providers.data.androidDevice(), () => {
              // Enrollment succeeded — no throw means device enrolled
              return Promise.resolve();
            });
          });
        });
      });
    });
  });

  test('multiple participants can enroll in same study', async ({ scenario, providers }) => {
    await scenario(async (s) => {
      await s.asUser('test_user1', async (auth) => {
        await auth.study(providers.data.study('MultiEnroll'), async (study) => {
          const p1 = providers.data.participant();
          const p2 = providers.data.participant();

          await study.participant(p1, async () => {});
          await study.participant(p2, async () => {});

          expect(p1.participantId).not.toEqual(p2.participantId);
        });
      });
    });
  });
});
