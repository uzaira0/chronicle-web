import type { Result } from 'axe-core';

export const WCAG_SMOKE_ROUTES = ['/', '/login'] as const;
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

export function formatAxeViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    - ${node.html}\n      ${node.failureSummary ?? 'No failure summary supplied.'}`)
        .join('\n');
      return `[${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n  (${violation.helpUrl})\n${nodes}`;
    })
    .join('\n\n');
}
