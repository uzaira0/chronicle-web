import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { basename, extname } from 'node:path';
import { BROWSER_DOWNLOAD_CSRF_FIELD } from '@/generated/chronicle-contracts';
import { BROWSER_DOWNLOAD_FILENAME_FIELD } from '@/lib/download';
import { toSyncExportSelection } from '@/lib/sync-export-selection';
import { createApiStore } from '@/test/study-operations-store';
import { studyOperationsApi } from './study-operations-api';

beforeEach(() => {
  window.location.href = 'http://localhost/';
});

const savedFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = savedFetch;
});

test('synchronous file downloads use browser form submissions without buffering', async () => {
  const filename = 'native-export.csv';
  const store = createApiStore();
  const forms: { action: string; method: string; fields: FormData }[] = [];
  const submit = spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    forms.push({ action: this.action, method: this.method, fields: new FormData(this) });
  });
  const blob = spyOn(Response.prototype, 'blob');
  globalThis.fetch = (() => {
    throw new Error('Native file requests must bypass fetch');
  }) as unknown as typeof fetch;
  try {
    const selection = toSyncExportSelection(['p1']);
    if (!selection) throw new Error('Single participant selection was rejected');
    const args = {
      studyId: 's1',
      participantIds: selection,
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      timeZone: 'UTC',
      filename,
    };
    await store
      .dispatch(studyOperationsApi.endpoints.downloadParticipantData.initiate({ ...args, dataType: 'UsageEvents' }))
      .unwrap();
    await store
      .dispatch(studyOperationsApi.endpoints.downloadParticipantTudData.initiate({ ...args, dataType: 'DayTime' }))
      .unwrap();
    await store
      .dispatch(studyOperationsApi.endpoints.downloadStudyTudData.initiate({ ...args, dataType: 'DayTime' }))
      .unwrap();
    await store
      .dispatch(
        studyOperationsApi.endpoints.downloadQuestionnaireResponses.initiate({
          studyId: args.studyId,
          questionnaireId: 'q1',
          filename,
        }),
      )
      .unwrap();
    expect(blob).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(4);
    for (const form of forms) {
      expect(form.method.toUpperCase()).toBe('POST');
      expect(form.fields.has(BROWSER_DOWNLOAD_CSRF_FIELD)).toBe(true);
      expect(new URL(form.action).search).toBe('');
      expect(form.fields.get(BROWSER_DOWNLOAD_FILENAME_FIELD)).toBe(basename(filename, extname(filename)));
    }
  } finally {
    submit.mockRestore();
    blob.mockRestore();
    store.dispatch(studyOperationsApi.util.resetApiState());
  }
});
