// Anything under an e2e/ directory is ignored by every rule.
export const spec = [{ label: 'Prose in an e2e file' }, new Error('Prose in an e2e file')];
export function Ignored() {
  return <p title="E2E title">Hello there</p>;
}
