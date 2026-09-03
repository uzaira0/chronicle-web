// Cases for web-i18n-error-message. error-message.tsx holds the .tsx twin.
export function cases(t: (k: string) => string, id: string, msg: string) {
  const errors = [
    new Error('No exports are configured'), // FIRE: web-i18n-error-message
    new Error(`Study ${id} was not found`), // FIRE: web-i18n-error-message
    new Error("Double quoted prose here"), // FIRE: web-i18n-error-message
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
    // ast-grep-ignore: web-i18n-error-message
    throw new Error('Identifier must be present here');
  }
  if (!msg) {
    // ast-grep-ignore
    throw new Error('A blanket ignore also suppresses this line');
  }
  // ast-grep-ignore: web-i18n-error-message -- trailing text breaks the suppression FIRE: unused-suppression
  if (errors.length > 3) throw new Error('Trailing text does not suppress this'); // FIRE: web-i18n-error-message
  throw new Error('Same-line ignore is checked below'); // ast-grep-ignore: web-i18n-error-message
}
// Documented hole: only `new Error(...)` is matched; TypeError/RangeError are developer errors.
