// Cleanup for a REDCap raw-data export of the Time Use Diary. REDCap erases an answer that
// branching hides only when the hiding happens live on the same survey page. When a
// participant goes back and changes an earlier answer (ends the day sooner, picks another
// activity), the answers that depended on the old one stay in the record. The form drops
// them (livePages, tud-prune); this does the same for REDCap: walking the dictionary in
// order, it clears every answer whose branching is false, recomputes the calcs, and
// unticks choices an @IF/@HIDECHOICE tag hides.
import { csvCell } from './redcap-dictionary';
import { evaluateRedcap, isShown, type RedcapRecord } from './redcap-logic';

export interface DictionaryEntry {
  variable: string;
  type: string;
  choices: string;
  branching: string;
  annotation: string;
}

/** RFC 4180 reader (quoted cells, doubled quotes, CRLF or LF rows). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  const cell = /("(?:[^"]|"")*"|[^,\r\n]*)(,|\r?\n|$)/gy;
  for (const m of text.matchAll(cell)) {
    if (m[0] === '') break;
    const raw = m[1] as string;
    row.push(raw.startsWith('"') ? raw.slice(1, -1).replaceAll('""', '"') : raw);
    if (m[2] !== ',') {
      rows.push(row);
      row = [];
    }
  }
  return rows;
}

const DICTIONARY_COLUMNS = {
  annotation: 'Field Annotation',
  branching: 'Branching Logic (Show field only if...)',
  choices: 'Choices, Calculations, OR Slider Labels',
  type: 'Field Type',
  variable: 'Variable / Field Name',
} as const;

/** The entries of a REDCap data dictionary CSV, in dictionary order. */
export function parseDictionaryCsv(text: string): DictionaryEntry[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('[tud-redcap] empty data dictionary');
  const at = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`[tud-redcap] data dictionary has no "${name}" column`);
    return index;
  };
  const cols = Object.fromEntries(Object.entries(DICTIONARY_COLUMNS).map(([k, name]) => [k, at(name)])) as Record<
    keyof typeof DICTIONARY_COLUMNS,
    number
  >;
  return rows.map((r) => ({
    annotation: r[cols.annotation] ?? '',
    branching: r[cols.branching] ?? '',
    choices: r[cols.choices] ?? '',
    type: r[cols.type] ?? '',
    variable: r[cols.variable] ?? '',
  }));
}

/** Choice codes of a radio/checkbox "1, Label | 2, Label" list. */
export function choiceCodes(choices: string): string[] {
  return choices
    .split('|')
    .map((part) => part.slice(0, part.indexOf(',')).trim())
    .filter((code) => code !== '');
}

const IF_HIDECHOICE = /^@IF\((\[[a-z0-9_]+\]='[^']*'), @HIDECHOICE='([^']*)', (.*)\)$/s;

/** Choices an @IF(...)/@HIDECHOICE chain hides for the record; [] for any other annotation. */
export function hiddenChoices(annotation: string, record: RedcapRecord): string[] {
  let rest = annotation.trim();
  if (!rest.startsWith('@IF(')) return [];
  while (rest.startsWith('@IF(')) {
    const m = IF_HIDECHOICE.exec(rest);
    if (!m) throw new Error(`[tud-redcap] unreadable @IF annotation: ${rest.slice(0, 80)}`);
    if (isShown(m[1] as string, record)) return (m[2] as string).split(',');
    rest = (m[3] as string).trim();
  }
  if (rest !== "''") throw new Error(`[tud-redcap] unexpected @IF tail: ${rest}`);
  return [];
}

/**
 * The record with every answer REDCap would hide cleared, calcs recomputed and hidden
 * choices unticked. Fields are visited in dictionary order, so a cleared answer also
 * hides the fields that depend on it.
 */
export function pruneRecord(entries: DictionaryEntry[], record: RedcapRecord): RedcapRecord {
  const out: RedcapRecord = { ...record };
  for (const entry of entries) {
    if (entry.type === 'descriptive') continue;
    const v = entry.variable;
    if (!isShown(entry.branching, out)) {
      out[v] = entry.type === 'checkbox' ? [] : '';
    } else if (entry.type === 'calc') {
      out[v] = String(evaluateRedcap(entry.choices, out));
    } else if (entry.type === 'checkbox') {
      const hidden = hiddenChoices(entry.annotation, out);
      const ticked = out[v];
      out[v] = Array.isArray(ticked) ? ticked.filter((code) => !hidden.includes(code)) : [];
    }
  }
  return out;
}

function sameValue(a: RedcapRecord[string] | undefined, b: RedcapRecord[string] | undefined): boolean {
  const norm = (x: RedcapRecord[string] | undefined) => (Array.isArray(x) ? [...x].sort().join(',') : (x ?? ''));
  return norm(a) === norm(b);
}

/** Checkbox `var___code` columns of a raw export, per checkbox variable. */
function checkboxColumns(
  entries: DictionaryEntry[],
  header: string[],
): Map<string, Array<{ code: string; column: number }>> {
  const out = new Map<string, Array<{ code: string; column: number }>>();
  for (const entry of entries.filter((e) => e.type === 'checkbox')) {
    const columns = choiceCodes(entry.choices)
      .map((code) => ({ code, column: header.indexOf(`${entry.variable}___${code}`) }))
      .filter((c) => c.column >= 0);
    out.set(entry.variable, columns);
  }
  return out;
}

function readRecord(
  entries: DictionaryEntry[],
  header: string[],
  row: string[],
  boxes: ReturnType<typeof checkboxColumns>,
) {
  const record: RedcapRecord = {};
  for (const entry of entries) {
    if (entry.type === 'checkbox') {
      record[entry.variable] = (boxes.get(entry.variable) ?? [])
        .filter((c) => row[c.column] === '1')
        .map((c) => c.code);
      continue;
    }
    const column = header.indexOf(entry.variable);
    if (column >= 0) record[entry.variable] = row[column] ?? '';
  }
  return record;
}

function writeRecord(
  entries: DictionaryEntry[],
  header: string[],
  row: string[],
  record: RedcapRecord,
  boxes: ReturnType<typeof checkboxColumns>,
) {
  const out = [...row];
  for (const entry of entries) {
    const value = record[entry.variable];
    if (entry.type === 'checkbox') {
      for (const c of boxes.get(entry.variable) ?? []) {
        out[c.column] = Array.isArray(value) && value.includes(c.code) ? '1' : '0';
      }
      continue;
    }
    const column = header.indexOf(entry.variable);
    if (column >= 0 && typeof value === 'string') out[column] = value;
  }
  return out;
}

/**
 * Clean a REDCap raw-data CSV export (variable-name header, raw codes, checkboxes as
 * `var___code` columns) against the project's data dictionary CSV. Columns the
 * dictionary does not know (event, timestamps, completion status) pass through.
 * Returns the cleaned CSV and how many answers were cleared.
 */
export function pruneExportCsv(dictionaryCsv: string, exportCsv: string): { csv: string; cleared: number } {
  const entries = parseDictionaryCsv(dictionaryCsv);
  const [header, ...rows] = parseCsv(exportCsv);
  if (!header) throw new Error('[tud-redcap] empty export');
  if (!header.includes('record_id')) throw new Error('[tud-redcap] export header is not raw variable names');
  const boxes = checkboxColumns(entries, header);
  let cleared = 0;
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const before = readRecord(entries, header, row, boxes);
    const after = pruneRecord(entries, before);
    cleared += entries.filter((e) => e.type !== 'calc' && !sameValue(before[e.variable], after[e.variable])).length;
    lines.push(writeRecord(entries, header, row, after, boxes).map(csvCell).join(','));
  }
  return { cleared, csv: `${lines.join('\r\n')}\r\n` };
}
