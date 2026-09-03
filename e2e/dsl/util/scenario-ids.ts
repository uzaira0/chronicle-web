export function e2eTitle(tag: string): string {
  return `E2E-${tag}-${crypto.randomUUID()}`;
}
