import { expect, test } from 'bun:test';
import { acknowledgeResearcherCreate, researcherCreateIntent } from './use-researcher-create-intent';

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
