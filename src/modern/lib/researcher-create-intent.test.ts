import { expect, spyOn, test } from 'bun:test';
import {
  acknowledgeResearcherCreate,
  RESEARCHER_CREATE_RETRY_WINDOW_MS,
  researcherCreateIntent,
  useResearcherCreateIntent,
} from './use-researcher-create-intent';

test('response-loss retries expire without extending the retry window or clearing a newer intent', async () => {
  const createdAt = Date.now();
  const clock = spyOn(Date, 'now').mockReturnValue(createdAt);
  const scope = '/expired-create';
  const payload = { format: 'CSV' };
  try {
    const first = await researcherCreateIntent(scope, payload);
    clock.mockReturnValue(createdAt + RESEARCHER_CREATE_RETRY_WINDOW_MS - 1);
    expect(await researcherCreateIntent(scope, payload)).toEqual(first);
    clock.mockReturnValue(createdAt + RESEARCHER_CREATE_RETRY_WINDOW_MS);
    const fresh = await researcherCreateIntent(scope, payload);
    expect(fresh.key).not.toBe(first.key);
    await acknowledgeResearcherCreate(first);
    expect(await researcherCreateIntent(scope, payload)).toEqual(fresh);
    await acknowledgeResearcherCreate(fresh);
  } finally {
    clock.mockRestore();
  }
});

test('an earlier success acknowledges only its captured intent while the newer request retains its retry key', async () => {
  const creates = useResearcherCreateIntent('/overlapping-creates');
  const first = await creates.currentIntent({ title: 'A' });
  const newer = await creates.currentIntent({ title: 'B' });
  await creates.acknowledge(first);
  expect(await creates.currentIntent({ title: 'B' })).toEqual(newer);
  await creates.acknowledge(newer);
});

test('outstanding creates retain their identity across new callers and changed payloads have a separate intent', async () => {
  const body = { title: 'retry-after-response-loss', contact: 'research@example.org' };
  const first = await researcherCreateIntent('/study', body);
  const retry = await researcherCreateIntent('/study', JSON.parse(JSON.stringify(body)));
  expect(retry).toEqual(first);
  expect(first.storageKey).not.toContain(body.title);
  expect(first.storageKey).not.toContain(body.contact);
  const edited = await researcherCreateIntent('/study', { ...body, title: 'separate create' });
  expect(edited.key).not.toBe(first.key);
  await acknowledgeResearcherCreate(first);
  expect((await researcherCreateIntent('/study', body)).key).not.toBe(first.key);
  expect(await researcherCreateIntent('/study', { ...body, title: 'separate create' })).toEqual(edited);
  await acknowledgeResearcherCreate(edited);
});
