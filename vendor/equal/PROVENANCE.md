# Vendored: Equal design system (`@eqds/*`)

## Source

Equal ("Equal — Accessibility Design System") is the project owner's own design system. Its
packages are generated from the Equal source tree (the `ontology/` SSOT and
`ontology/scripts/sync_packages.py` named in the package READMEs live there, not in this repo).
The source is not published to npm or to a public repository.

Source location: `git@github.com:uzaira0/a11y-design-system-template.git`
Source commit: `cb4002ad1dd702046cc6e3e2a78af3d3bbaf9a4d` (2026-05-19, "ci: add gitleaks secret-scanning workflow")

The repository is private (owner access). At that commit the tracked `packages/*/dist/` files
match the hashes below, with two differences, both made here: `packages/css/dist/equal.css`
drops its first-line `@import url("../../tokens/src/tokens.css");` (the vendored copy carries only
`tokens/dist`, and the dashboard imports `tokens.css` itself), and the `b2afd3ee` reduced-motion
edit noted under Version. Identified by hashing each file at every commit of the
source repository; `cb4002a` is the newest commit before the vendoring commit whose `tokens.css`,
`react` and `icons` builds match.

Author: Uzair Alam (project owner). License: MIT (see `LICENSE`).

## Version

| Package | Version | Vendored in | Consumed as |
|---|---|---|---|
| `@eqds/tokens` | 0.1.0 | chronicle-web commit `9afc68c3` (2026-06-06) | `file:vendor/equal/packages/tokens` |
| `@eqds/css` | 0.1.0 | `9afc68c3` | `file:vendor/equal/packages/css` |
| `@eqds/react` | 0.1.0 | `9afc68c3` | `file:vendor/equal/packages/react` |
| `@eqds/icons` | 0.1.0 | `9afc68c3` | `file:vendor/equal/packages/icons` |

The owner licenses the Equal packages under MIT. The unused
`@eqds/radix` package is not vendored.

Content hashes of the vendored build output (sha256), to tell an upstream refresh from a local edit:

- `packages/tokens/dist/tokens.css` `70b12bb94827632a88e8e48c33ef2d2a82ab56d75bc001d8e14dd3e69257d03f`
- `packages/css/dist/equal.css` `4e17ca51621a457f529997c18e1dcdf3e87d34c5335009512d200e4c2782045f`
  (local edit in `b2afd3ee`: the `prefers-reduced-motion` block sets `animation: none` instead of
  `animation-duration: .01ms`; the upstream build hashed `579cb5b5…`. Re-apply after a refresh.)
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
4. In chronicle-web: `bun install`, `bun run build`, `bun run check`.
