// Cases for web-i18n-placeholder-prose. Prose fires; identifier-shaped examples are allowed.
export function Cases({ t }: { t: (k: string) => string }) {
  return (
    <div>
      <input placeholder="Enter your name" />{/* FIRE: web-i18n-placeholder-prose */}
      <input placeholder="Search studies…" />{/* FIRE: web-i18n-placeholder-prose */}
      <input placeholder='Type a message here' />{/* FIRE: web-i18n-placeholder-prose */}
      <textarea placeholder="Describe the study in a sentence" />{/* FIRE: web-i18n-placeholder-prose */}
      <input placeholder={'Enter a name here'} />{/* FIRE: web-i18n-placeholder-prose */}
      <input placeholder={`Search ${t('x')} by name`} />{/* FIRE: web-i18n-placeholder-prose */}
      <input placeholder={t('participants.id_placeholder')} />
      <input placeholder={`${t('x')}`} />
      <input placeholder="researcher@university.edu" />
      <input placeholder="https://research.example.org/consent/study.pdf" />
      <input placeholder="custom-filename.csv" />
      <input placeholder="2026-08-17T09:30:00-05:00" />
      <input placeholder="1.0" />
      <input placeholder="••••••••" />
      <input placeholder="e.g. 100" />
      <input placeholder="Search" />
    </div>
  );
}
// Documented hole: a single-word placeholder such as "Search" is not matched, because the rule
// cannot tell a word from an identifier-shaped example. Use `{t('...')}` for those.
