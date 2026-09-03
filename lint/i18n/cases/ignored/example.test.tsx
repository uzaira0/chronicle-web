// *.test.tsx files are ignored by every rule.
export function Ignored() {
  throw new Error('Prose in a test file is fine');
  return <p title="Test title">Hello there</p>;
}
