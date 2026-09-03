// Cases for web-i18n-jsx-text and web-i18n-jsx-string-expression.
// A `FIRE:` marker names the finding expected on that line; unmarked lines must be clean.
// A JSX text node is reported on the line where it starts, which for a wrapped paragraph is
// the line of the opening tag.
export function Cases({ t, n }: { t: (k: string) => string; n: number }) {
  return (
    <div>
      <p>Hello there</p>{/* FIRE: web-i18n-jsx-text */}
      <p>Delete</p>{/* FIRE: web-i18n-jsx-text */}
      <p>Yes</p>{/* FIRE: web-i18n-jsx-text */}
      <p>OK</p>{/* FIRE: web-i18n-jsx-text */}
      <p>Total: {n}</p>{/* FIRE: web-i18n-jsx-text */}
      <p>Don&apos;t stop now</p>{/* FIRE: web-i18n-jsx-text, web-i18n-jsx-text */}{/* an entity splits the text into two nodes */}
      <p>{n} items selected</p>{/* FIRE: web-i18n-jsx-text */}
      <code>npm install</code>{/* FIRE: web-i18n-jsx-text */}
      <p>{/* FIRE: web-i18n-jsx-text */}
        A text node that starts on the previous line
      </p>
      <p>{'Hello world'}</p>{/* FIRE: web-i18n-jsx-string-expression */}
      <p>{"Delete"}</p>{/* FIRE: web-i18n-jsx-string-expression */}
      <p>{`Template text`}</p>{/* FIRE: web-i18n-jsx-string-expression */}
      <p>{`${n}. Numbered prose`}</p>{/* FIRE: web-i18n-jsx-string-expression */}
      <p>{t('greeting')}</p>
      <p>Chronicle</p>
      <code>studyId</code>
      <a href="/withdrawal">/withdrawal</a>
      <span>bcm.edu/privacy</span>
      <span>ms</span>
      <span>42</span>
      <span>·</span>
      <span>—</span>
      <span>{' '}</span>
      <span>{'Chronicle'}</span>
      <span>{'studyId'}</span>
      <span>{'ms'}</span>
      <span>{/* an English comment is not rendered text */}</span>
      <span>{n > 1 ? 'items' : 'item'}</span>
      <span>{['a', 'b'].join('Joined words')}</span>
      <span>{`${n}. ${t('title')}`}</span>
      <span>{`question-title-${n}`}</span>
      <span>{`mailto:${t('email')}`}</span>
    </div>
  );
}
// The last two lines document a known hole: a literal nested inside a ternary or a call is not
// matched, because matching every nested string would also flag t('key') arguments.
