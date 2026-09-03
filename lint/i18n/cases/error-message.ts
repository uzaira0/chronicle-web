// Cases for web-i18n-error-message-ts. error-message.tsx holds the .tsx twin.
export function cases(t: (k: string) => string, id: string, msg: string) {
  const errors = [
    new Error('No exports are configured'), // FIRE: web-i18n-error-message-ts
    new Error(`Study ${id} was not found`), // FIRE: web-i18n-error-message-ts
    new Error("Double quoted prose here"), // FIRE: web-i18n-error-message-ts
    new Error('[study-constants] Expected array here'),
    new Error(`[normalize] Expected object, received ${id}`),
    new Error(msg),
    new Error(t('errors.generic')),
    new Error('unreachable'),
    new Error(''),
    new TypeError('Bad input value here'),
    new Error(`${id}`),
  ];
  if (!id) {
    // developer invariant: a suppression on the line above is honored
    // ast-grep-ignore: web-i18n-error-message-ts
    throw new Error('Identifier must be present here');
  }
  if (!msg) {
    // ast-grep-ignore
    throw new Error('A blanket ignore also suppresses this line');
  }
  // ast-grep-ignore: web-i18n-error-message-ts -- a note after the rule id is allowed since ast-grep 0.45.2
  if (errors.length > 3) throw new Error('A suppression with a note still applies');
  throw new Error('Same-line ignore is checked below'); // ast-grep-ignore: web-i18n-error-message-ts
}
// Documented hole: only `new Error(...)` is matched; TypeError/RangeError are developer errors.
