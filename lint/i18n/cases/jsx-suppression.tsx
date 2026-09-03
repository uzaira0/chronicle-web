// Suppression semantics inside JSX: a JSX comment expression carrying the ignore directive is
// NOT an ignore comment for ast-grep, so nothing inside JSX markup can be suppressed. Each
// attempt below is reported as `unused-suppression` and the violation still fires. Restructure
// the markup or move the copy to the translation table instead.
export function Cases() {
  return (
    <div>
      {/* ast-grep-ignore: web-i18n-jsx-text FIRE: unused-suppression */}
      <p>Still reported after a comment on the previous line</p>{/* FIRE: web-i18n-jsx-text */}
      {/* ast-grep-ignore: web-i18n-jsx-attr FIRE: unused-suppression */}
      <button title="Attribute suppression does not work" type="button" />{/* FIRE: web-i18n-jsx-attr */}
      {/* ast-grep-ignore: web-i18n-jsx-string-expression FIRE: unused-suppression */}
      <p>{'String expression suppression does not work'}</p>{/* FIRE: web-i18n-jsx-string-expression */}
    </div>
  );
}
