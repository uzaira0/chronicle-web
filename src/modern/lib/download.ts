import { BROWSER_DOWNLOAD_CSRF_FIELD } from '@/generated/chronicle-contracts';
import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';

export const BROWSER_DOWNLOAD_FILENAME_FIELD = 'fileName';

/**
 * Sanitizes a filename by replacing path traversal sequences and OS-illegal characters.
 *
 * @param filename The filename to sanitize.
 * @returns The sanitized filename.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '__') // Replace path traversal sequences
    .replace(/[\\/:*?"<>|]/g, '_'); // Replace OS-illegal characters (path separators + Windows reserved: : * ? " < > |)
}

/**
 * Triggers a browser download for the provided Blob.
 *
 * @param blob The data to download.
 * @param filename The suggested filename for the download.
 */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    navigateDownload(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function navigateDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  anchor.referrerPolicy = 'no-referrer';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

/** Native POST navigation keeps file bodies out of JavaScript and credentials out of URLs. */
export function navigatePostDownload(url: string, csrfToken: string, filename?: string) {
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin)
    throw new Error(createTranslator(getCurrentLanguage()).t('common.error_download_browser'));
  if (filename)
    target.searchParams.set(BROWSER_DOWNLOAD_FILENAME_FIELD, sanitizeFilename(filename.replace(/\.csv$/i, '')));
  target.searchParams.set(BROWSER_DOWNLOAD_CSRF_FIELD, csrfToken);
  const form = document.createElement('form');
  form.action = target.pathname;
  form.method = 'POST';
  form.target = '_blank';
  form.rel = 'noopener';
  form.hidden = true;
  for (const [name, value] of target.searchParams) {
    const field = document.createElement('input');
    field.type = 'hidden';
    field.name = name;
    field.value = value;
    form.appendChild(field);
  }
  document.body.appendChild(form);
  try {
    HTMLFormElement.prototype.submit.call(form);
  } finally {
    form.remove();
  }
}
