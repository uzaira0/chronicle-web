# Web translations

`en/translation.json` is the base table. Every user-facing string in `src/modern` resolves
through `useTranslator()` (or `createTranslator(code)` outside React) with English fallback per
key, so a partial translation never blanks the page.

## Adding or completing a language

1. Copy `en/translation.json` to `<code>/translation.json` if the directory does not exist and
   register the code in `language-codes.ts` (`SUPPORTED_BASE_CODES`) and `translations.ts`.
2. Translate values only. Keep `{{placeholders}}` verbatim and keep arrays the same length.
3. `bun run i18n:report es` prints the keys `es` still lacks with the English text.
4. Do not machine-translate; only a qualified translator should fill a table. Untranslated keys
   simply fall back to English at runtime.

## Catalog labels

Study features, collection modules, sensors, dispositions and export data types keep their
English presentation in `lib/study-constants.ts` and `lib/participant-data-types.ts`. Run
`bun run i18n:sync-catalog` after changing those files; it regenerates the `catalog.*` keys in
the English table so a language table can override any of them.

## Language selection

`?lang=<code>` (and `?gender=` for Hebrew) on a participant link wins, then the stored
preference (`chronicle.language`), then the browser language. The switcher lives in both shells
and every standalone participant page. Right-to-left languages flip `dir` automatically.

## Verifying nothing is hardcoded

`bun run i18n:lint` runs the ast-grep rules in `lint/i18n/` over `src/modern` (also part of
`bun run check` and the monorepo `make i18n-lint`). They fail the build on:

| Rule | Catches |
| --- | --- |
| `web-i18n-jsx-text` | English words as JSX text (the brand word, camelCase identifiers, path/URL-shaped tokens, and lowercase unit tokens such as `ms` are allowed) |
| `web-i18n-jsx-string-expression` | `{'literal'}` / `{`literal`}` as a JSX child; only the literal fragments of a template count |
| `web-i18n-jsx-attr` | literal `title`, `alt`, `label`, `description`, `aria-label`, … attributes, whether `title="…"` or `title={'…'}` |
| `web-i18n-placeholder-prose` | multi-word prose in `placeholder` (identifier-shaped examples such as an email or URL are allowed) |
| `web-i18n-object-label` / `-ts` | prose stored in a `label`/`title`/`description`/`message` object property (catalog source files are excluded; they are overridden via `translateCatalog`) |
| `web-i18n-error-message` / `-ts` | prose in `new Error(...)` unless it carries a bracketed developer tag such as `[study-constants] …` |

The `-ts` twins are the same rules for plain `.ts` files, since ast-grep applies a rule only to
its own language; use the twin's id in a suppression comment inside a `.ts` file.

**Suppressing.** `// ast-grep-ignore: <rule-id>` (or a bare `// ast-grep-ignore`) on its own
line directly above the statement. Trailing text after the rule id breaks it, a same-line
trailing comment is not consulted, and nothing inside JSX markup can be suppressed (a JSX comment
expression is not an ignore comment) — restructure the markup or move the copy to the table.

**Proof.** `lint/i18n/cases/` is a table-driven suite: every line carrying a `FIRE: rule-id`
marker must produce exactly that finding and every other line must be clean, ignored paths and
every suppression form are exercised, and every declared rule must fire at least once.
`bun run i18n:lint:selftest` runs it; the monorepo `scripts/i18n-lint-mutation.sh` additionally
plants a violation in the real `src/modern` tree, checks `bun run i18n:lint` fails naming it,
and removes it. `bun run i18n:report es --check` fails on stale keys.

**Known holes, on purpose** (documented as clean lines in the suite): a literal nested inside a
ternary or a call (`{n > 1 ? 'items' : 'item'}`), a single-word placeholder or object label
(`'Search'`, `'daily'`), a quoted object key, and `TypeError`/`RangeError` messages. Matching
those would also flag `t('key')` arguments and wire values.

Verified with ast-grep 0.42.1.

**Pseudo-locale.** Open any page with `?lang=en-XA` (the Android/Chrome pseudo-locale
convention): every table string renders with accented letters (`Ŵĥáţ ɱáðé Monday …`), so text
that stays plain English is hardcoded or came from the server. It is never offered in the
picker.

**Off-the-shelf tools evaluated (2026-09-02).** `eslint-plugin-i18next` `no-literal-string` is
the widely used ESLint rule for this; run in `jsx-only` mode over `src/modern` it reported 145
findings untuned and 5 after tuning, four of them wire values, and it cannot honour
`ast-grep-ignore`, see `.ts` files, or check thrown errors, so the ast-grep rules stay the
gate (the tuned config lives outside the repo for re-runs). `@lingual/i18n-check` misreads this
translator's `_one`/`_many` keys and dynamic `catalog.*` lookups, so `i18n:report` remains the
key-hygiene check. Plural and gender grammar is not modelled; when a language needing it
lands, MessageFormat 2 (stable in CLDR 47) is the standard to adopt rather than ad-hoc suffixes.
