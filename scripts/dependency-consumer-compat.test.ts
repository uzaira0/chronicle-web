import { describe, expect, test } from 'bun:test';
import { BaseResolver } from '@redocly/openapi-core';

describe('patched minimatch consumer compatibility', () => {
  test.each(['without protocol', 'with protocol', 'nonmatching host'])(
    'Redocly resolves remote schemas with a %s header pattern',
    async (patternKind) => {
      const receivedHeaders: (string | null)[] = [];
      const document = { openapi: '3.1.0', info: { title: 'Dependency fixture', version: '1.0' } };
      const host = 'example.invalid';
      const matches =
        patternKind === 'with protocol'
          ? `https://${host}/**`
          : patternKind === 'nonmatching host'
            ? 'other.invalid/**'
            : `${host}/**`;
      const resolver = new BaseResolver({
        http: {
          headers: [{ matches, name: 'x-dependency-fixture', value: 'matched' }],
          customFetch(_url: string, options: { headers: Record<string, string> }) {
            receivedHeaders.push(options.headers['x-dependency-fixture'] ?? null);
            return Promise.resolve(Response.json(document));
          },
        },
      });
      const resolved = await resolver.resolveDocument(null, `https://${host}/schema.json`, true);
      if ('originalError' in resolved) throw resolved.originalError;
      expect(resolved.parsed as unknown).toEqual(document);
      expect(receivedHeaders).toEqual([patternKind === 'nonmatching host' ? null : 'matched']);
    },
  );
});
