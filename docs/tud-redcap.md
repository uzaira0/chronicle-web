# Time Use Diary as a REDCap survey

`bun run tud:redcap` writes REDCap data dictionaries for the Time Use Diary from the
diary's own page schema (`src/modern/components/tud/tud-schema.ts`), option builders and
translation tables. The wording and choices are the ones the Chronicle form shows; the
generator adds only the REDCap structure.

```sh
bun run tud:redcap                                  # build/tud-redcap/, 40 activity blocks
bun run tud:redcap -- --out DIR --max 48            # another directory or block count
```

Output, per diary day (`today`, `yesterday`) and study variant (`standard`, `osu`,
`sherbrooke`):

- `tud-<day>-<variant>-<language>.csv`: one data dictionary per language (en, de, es, sv,
  he-male, he-female). The `today` diary exists only in en, de and Hebrew, as in the form.
- `codebook-<day>-<variant>.csv`: every REDCap variable, the Chronicle answer code it
  holds, its activity block, and each choice code with the value Chronicle stores. Codes
  are the same in every language, so exports from projects in different languages merge.

## Setting up the project

### 1. Pick the file

`tud-<day>-<variant>-<language>.csv`. Day: `yesterday` (parents report the previous day) or
`today`, whichever the Chronicle study used. Variant: `standard` unless the study is the Ohio
State or Sherbrooke version. Language: one project per language. Most studies want
`tud-yesterday-standard-en.csv`. Keep the matching `codebook-<day>-<variant>.csv`.

### 2. Create the project

1. **New Project** → title → **Empty project (blank slate)** → **Create Project**.
2. **Project Setup** → **Main project settings** → **Enable** next to *Use surveys in this
   project?*.
3. **Enable optional modules and customizations** → **Additional customizations**: turn off
   record auto-numbering, so record IDs are your Chronicle participant IDs.

### 3. Upload the dictionary

1. **Project Setup** → **Data Dictionary** → choose the CSV → **Upload File**. REDCap
   validates it and lists errors or warnings before anything changes. Report any to whoever
   maintains this generator.
2. **Commit Changes**. One instrument, `time_use_diary`, of about 1,000 fields (the 40
   activity blocks; participants see only the ones they use).

### 4. Make it a survey

1. **Online Designer** → **Enable** in the survey column next to `time_use_diary`.
2. In **Survey Settings** set **Question display format** to **One section per page
   (multiple pages)**. Required: it is what gives each activity its two pages and what
   skips unused blocks.
3. Leave the **Previous Page** button on; the export cleanup below handles going back.
4. Set a survey title (the diary's introduction is already the first item) → **Save Changes**.
5. Check that your REDCap lists `@IF` under **Action Tags** in the Online Designer. Without
   it the secondary-activity list does not hide the current activity; everything else works.

### 5. Participants and links

1. **Data Import Tool**: upload a CSV with one column, `record_id`, holding the Chronicle
   participant IDs. One record per participant, so the diary joins the phone data.
2. One link: the record's **Record Home Page** → the diary → **Survey options** → **Open
   survey** or copy the link. Many links: the API method *Export a Survey Link for a
   Participant* (`record` = the ID, `instrument` = `time_use_diary`).
3. Several diary days: on Project Setup enable longitudinal data collection, **Define My
   Events** (day_1, day_2, …), designate the instrument to each event, then schedule the
   daily sends in the Online Designer under **Automated Survey Invitations**.

### 6. Test before collecting data

In development status, take the survey three times:

1. A short day: 2–3 activities, the last ending at bedtime. It must go straight to the
   night questions.
2. Reading, then screen media: each gets its own follow-ups, and the second activity's
   "what else" list does not offer screen media.
3. Going back: enter 4 activities, go back to the second and set its end to bedtime; the
   later activities must disappear.

Times are typed as 24-hour HH:MM (e.g. `07:30`) or set with the Now button. Move to
production only after these pass; dictionary changes after that need draft mode.

### 7. Every export

Export **CSV / Microsoft Excel (raw data)**, then run the cleanup (below) with the same
dictionary file you uploaded, and use the codebook to map codes back to Chronicle's values.

To combine languages in one project instead: **Multi-Language Management** → add a language →
export its template as JSON; the generator can fill that template once one exists.

## How the diary maps to REDCap

- **The activity loop.** Chronicle repeats activity pages until an activity ends at the
  day's end time. REDCap gets `--max` fixed blocks (`a01_…` to `a40_…`). Each block stores
  a hidden calc `aNN_last` (1 once its end time reaches the day end), and block k is shown
  only while every earlier block's flag is 0. Every field of a block, the flag included,
  carries that condition, so a closed block's pages are skipped. `activities_overflow` is
  1 when the day was still open after the last block.
- **Two pages per activity**, as in the form: the activity and its end time, then the
  follow-up questions. Questions that depend on the activity use branching on the previous
  page; questions that depend on an answer on the same page hide live.
- **Secondary activities** hide the current activity with `@IF(…, @HIDECHOICE=…)`. That works
  because the activity was saved on the previous page and action tags are evaluated when a
  page loads.
- **"Other"** is choice code 99 plus a `<variable>_oth` text field.
- **Time checks** (an end before its start, past the bedtime) show the form's error text as
  a red warning. REDCap cannot block the page on a cross-field time rule.
- **Times** are REDCap `time` fields (24-hour HH:MM). The form's 12-hour display has no
  REDCap equivalent.

## Answers left behind by going back

REDCap erases an answer that branching hides only when the hiding happens live on the
same survey page. If a participant goes back and ends the day sooner, or changes an
activity, the answers that depended on the old answer stay in the record (their pages are
skipped, so the participant never sees them). The form drops them before submitting.

Clean every export before analysis:

```sh
bun run tud:redcap:prune -- --dictionary tud-yesterday-standard-en.csv \
  --in export.csv --out export-clean.csv
```

The export must be REDCap's CSV raw data with variable names as the header. The cleanup
walks the dictionary in order, clears every answer whose branching is false for that
record, recomputes the calcs and unticks choices an `@IF`/`@HIDECHOICE` tag hides. Columns
the dictionary does not know (event, timestamps, completion status) pass through. A diary
nobody went back in comes out unchanged (tested). REDCap's own Data Quality rule F
("hidden fields that contain values") lists the same answers inside the project.

An activity end time past the bedtime is an error in the form; in REDCap it shows the
warning and also closes the diary, because the block counts as reaching the day end.

## What the tests prove and what they do not

`src/modern/components/tud/redcap/redcap-dictionary.test.ts` walks random diaries through
the real form engine (`pageKind`, `buildPage`, `advancePage`) in every language, day and
variant, converts the answers to a REDCap record, and evaluates the generated branching
with a REDCap logic evaluator (`src/modern/test/redcap-logic.ts`). For every diary REDCap
shows exactly the questions the form showed; the piped labels equal the form's wording;
every choice label matches; codes agree across languages; every logic reference names a
field defined earlier.

Not proven without a REDCap server: the upload itself, the survey page-skipping, `@IF`
evaluation at page load, and `datediff` on two time fields as REDCap's own documentation
describes them. Upload one dictionary to a development project and take the survey once
through a short day, a day with reading and screen media, and a day that ends early after
going back. `@IF` needs a REDCap version that lists it under Action Tags.

## Not carried over

- The summary page before submitting.
- Multi-Language Management: each language is its own dictionary. Combining them needs a
  translation template exported from the target REDCap instance.
- Chronicle's summarized export: rebuild it from the REDCap export with the codebook.
