// src/modern/test/** is ignored by every rule.
export const setup = [{ label: 'Prose in test setup' }, new Error('Prose in test setup')];
export function Ignored() {
  return <p title="Setup title">Hello there</p>;
}
