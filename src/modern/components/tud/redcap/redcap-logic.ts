// Evaluator for the subset of REDCap logic the TUD data dictionary emits: `and` / `or`,
// comparisons (= <> != > < >= <=), parentheses, field references `[var]` and checkbox
// references `[var(code)]`, quoted strings, numbers, true/false, `if(cond, a, b)` and
// `datediff(a, b, "m", "ymd", true)` on HH:MM time values. The export cleanup
// (redcap-export.ts) uses it to clear answers REDCap kept after they were hidden, and the
// parity tests use it to evaluate the generated branching without a REDCap server.
// Anything outside the subset throws, so the generator cannot start emitting syntax this
// file silently misreads.

export type RecordValue = string | string[];
export type RedcapRecord = Record<string, RecordValue>;
type Value = string | number | boolean;

type Token =
  | { kind: 'field'; name: string; code?: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'punct'; value: string };

type Lexed = { token: Token; length: number } | undefined;

const FIELD_REF = /^\[([a-z][a-z0-9_]*)(?:\(([A-Za-z0-9_]+)\))?\]/;
const STRING = /^'([^']*)'|^"([^"]*)"/;
const OPERATOR = /^(<>|!=|>=|<=|=|<|>)/;
const PUNCT = /^[(),]/;
const NUMBER = /^-?\d+(\.\d+)?/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

const LEXERS: Array<(rest: string) => Lexed> = [
  (rest) => {
    const m = FIELD_REF.exec(rest);
    if (!m) return undefined;
    const name = m[1] as string;
    const token: Token = m[2] === undefined ? { kind: 'field', name } : { code: m[2], kind: 'field', name };
    return { length: m[0].length, token };
  },
  (rest) => {
    const m = STRING.exec(rest);
    return m ? { length: m[0].length, token: { kind: 'string', value: m[1] ?? m[2] ?? '' } } : undefined;
  },
  (rest) => {
    const m = OPERATOR.exec(rest);
    const op = m?.[1] === '!=' ? '<>' : m?.[1];
    return m && op ? { length: m[0].length, token: { kind: 'op', value: op } } : undefined;
  },
  (rest) => {
    const m = PUNCT.exec(rest);
    return m ? { length: 1, token: { kind: 'punct', value: m[0] } } : undefined;
  },
  (rest) => {
    const m = NUMBER.exec(rest);
    return m ? { length: m[0].length, token: { kind: 'number', value: Number(m[0]) } } : undefined;
  },
  (rest) => {
    const m = IDENT.exec(rest);
    return m ? { length: m[0].length, token: { kind: 'ident', value: m[0] } } : undefined;
  },
];

function lexOne(rest: string): Lexed {
  for (const lex of LEXERS) {
    const lexed = lex(rest);
    if (lexed) return lexed;
  }
  return undefined;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let rest = src.trimStart();
  while (rest !== '') {
    const lexed = lexOne(rest);
    if (!lexed) throw new Error(`[redcap-logic] cannot read "${rest.slice(0, 20)}" in ${src}`);
    tokens.push(lexed.token);
    rest = rest.slice(lexed.length).trimStart();
  }
  return tokens;
}

function minutes(value: Value): number {
  if (typeof value !== 'string') return Number.NaN;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

function toNumber(value: Value): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value.trim() === '' ? Number.NaN : Number(value);
}

function truthy(value: Value): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return value !== '' && value !== '0';
}

const ORDERING: Record<string, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
};

function compare(op: string, a: Value, b: Value): boolean {
  const na = toNumber(a);
  const nb = toNumber(b);
  const numeric = !Number.isNaN(na) && !Number.isNaN(nb);
  if (op === '=' || op === '<>') {
    const equal = numeric ? na === nb : String(a) === String(b);
    return op === '=' ? equal : !equal;
  }
  const order = ORDERING[op];
  if (!order) throw new Error(`[redcap-logic] unknown operator ${op}`);
  return numeric && order(na, nb); // REDCap: ordering against a blank or text is false
}

function ifFunction(args: Value[]): Value {
  const [cond, a, b] = args;
  if (cond === undefined || a === undefined || b === undefined)
    throw new Error('[redcap-logic] if() needs 3 arguments');
  return truthy(cond) ? a : b;
}

function datediffFunction(args: Value[]): Value {
  const [a, b, unit, format, signed] = args;
  if (a === undefined || b === undefined || unit !== 'm' || format !== 'ymd' || signed !== true) {
    throw new Error('[redcap-logic] only datediff(a, b, "m", "ymd", true) is supported');
  }
  return minutes(b) - minutes(a);
}

const FUNCTIONS: Record<string, (args: Value[]) => Value> = { datediff: datediffFunction, if: ifFunction };

class Parser {
  private pos = 0;
  private readonly tokens: Token[];
  private readonly record: RedcapRecord;

  constructor(tokens: Token[], record: RedcapRecord) {
    this.tokens = tokens;
    this.record = record;
  }

  parse(): Value {
    const value = this.or();
    if (this.pos !== this.tokens.length) throw new Error(`[redcap-logic] trailing tokens at ${this.pos}`);
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new Error('[redcap-logic] unexpected end of expression');
    this.pos += 1;
    return token;
  }

  private atPunct(value: string): boolean {
    const t = this.peek();
    return t?.kind === 'punct' && t.value === value;
  }

  private expectPunct(value: string) {
    if (!this.atPunct(value)) throw new Error(`[redcap-logic] expected ${value}`);
    this.pos += 1;
  }

  private atWord(value: string): boolean {
    const t = this.peek();
    return t?.kind === 'ident' && t.value.toLowerCase() === value;
  }

  private or(): Value {
    let left = this.and();
    while (this.atWord('or')) {
      this.next();
      const right = this.and();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  private and(): Value {
    let left = this.comparison();
    while (this.atWord('and')) {
      this.next();
      const right = this.comparison();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  private comparison(): Value {
    const left = this.primary();
    const t = this.peek();
    if (t?.kind !== 'op') return left;
    this.next();
    return compare(t.value, left, this.primary());
  }

  private args(): Value[] {
    this.expectPunct('(');
    const out: Value[] = [this.or()];
    while (this.atPunct(',')) {
      this.next();
      out.push(this.or());
    }
    this.expectPunct(')');
    return out;
  }

  private fieldValue(name: string, code: string | undefined): Value {
    const raw = this.record[name];
    if (code !== undefined) return Array.isArray(raw) && raw.includes(code) ? '1' : '0';
    if (Array.isArray(raw)) throw new Error(`[redcap-logic] [${name}] is a checkbox; reference a choice`);
    return raw ?? '';
  }

  private word(value: string): Value {
    const name = value.toLowerCase();
    if (name === 'true' || name === 'false') return name === 'true';
    const fn = FUNCTIONS[name];
    if (!fn) throw new Error(`[redcap-logic] unsupported identifier ${value}`);
    return fn(this.args());
  }

  private primary(): Value {
    const t = this.next();
    if (t.kind === 'string' || t.kind === 'number') return t.value;
    if (t.kind === 'field') return this.fieldValue(t.name, t.code);
    if (t.kind === 'ident') return this.word(t.value);
    if (t.kind === 'punct' && t.value === '(') {
      const inner = this.or();
      this.expectPunct(')');
      return inner;
    }
    throw new Error(`[redcap-logic] unexpected token ${JSON.stringify(t)}`);
  }
}

/** Evaluate a REDCap logic or calculation expression against a record. */
export function evaluateRedcap(expression: string, record: RedcapRecord): Value {
  return new Parser(tokenize(expression), record).parse();
}

/** Branching logic: an empty expression always shows the field. */
export function isShown(branching: string, record: RedcapRecord): boolean {
  return branching.trim() === '' || truthy(evaluateRedcap(branching, record));
}

/** Every field name referenced by an expression, with the checkbox code when present. */
export function referencedFields(expression: string): Array<{ name: string; code?: string }> {
  return [...expression.matchAll(/\[([a-z][a-z0-9_]*)(?:\(([A-Za-z0-9_]+)\))?\]/g)].map((m) =>
    m[2] === undefined ? { name: m[1] as string } : { code: m[2], name: m[1] as string },
  );
}
