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
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
