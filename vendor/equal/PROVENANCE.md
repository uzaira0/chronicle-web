# Vendored: Equal design system (`@eqds/*`)

## Source

Equal ("Equal — Accessibility Design System") is the project owner's own design system. Its
packages are generated from the Equal source tree (the `ontology/` SSOT and
`ontology/scripts/sync_packages.py` named in the package READMEs live there, not in this repo).
The source is not published to npm or to a public repository.

Upstream repository URL: not recorded yet (owner to fill in).

## Version

| Package | Version | Vendored in | Consumed as |
|---|---|---|---|
| `@eqds/tokens` | 0.1.0 | chronicle-web commit `9afc68c3` (2026-06-06) | `file:vendor/equal/packages/tokens` |
| `@eqds/css` | 0.1.0 | `9afc68c3` | `file:vendor/equal/packages/css` |
| `@eqds/react` | 0.1.0 | `9afc68c3` | `file:vendor/equal/packages/react` |
| `@eqds/icons` | 0.1.0 | `9afc68c3` | `file:vendor/equal/packages/icons` |

License metadata (`"license": "Apache-2.0"`) was added in `3b9b53af` (2026-07-04). The unused
`@eqds/radix` package was removed in the 2026-09-24 launch-audit pass.

Content hashes of the vendored build output (sha256), to tell an upstream refresh from a local edit:

- `packages/tokens/dist/tokens.css` `70b12bb94827632a88e8e48c33ef2d2a82ab56d75bc001d8e14dd3e69257d03f`
- `packages/css/dist/equal.css` `579cb5b553af706dc15f6577f2a2519ad52d428ce7fd6a90aa4f5350543a849b`
- `packages/react/dist/index.js` `e805a278cefc594773e8562eb754fe37b5e44050925809c8499ade18e7962fc1`
- `packages/icons/dist/index.js` `08f94c0ae871e87fe88b6579225ad29f07e5147e3342d1bf37861e2559900658`

Third-party content inside: the fonts in `packages/tokens/dist/fonts/` are Atkinson Hyperlegible
(Braille Institute) and IBM Plex Mono (IBM), both SIL OFL 1.1; the license travels with them in
`packages/tokens/dist/fonts/OFL.txt` and the build copies it to `dist/fonts/OFL.txt`.

## Why vendored

The packages are private (`"private": true`) and not on any registry, so `bun install` can only
reach them through `file:` dependencies. Vendoring also keeps the dashboard build reproducible
and offline: the frozen-lockfile install in `docker/Dockerfile.frontend.prod` needs no network
access for them.

## Updating

1. In the Equal source tree, regenerate the packages (`python3 ontology/scripts/sync_packages.py`).
2. Copy each package's `package.json`, `README.md` and `dist/` over the matching directory in
   `vendor/equal/packages/`. Do not edit vendored files by hand.
3. Update the version table and hashes above.
4. In chronicle-web: `bun install`, `bun run build`, `bun run check`, `bunx size-limit`.
