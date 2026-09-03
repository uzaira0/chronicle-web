# @eqds/tokens

Token package for Equal. Runtime CSS is synchronized from the validated drop-in output, and DTCG/report artifacts are generated from `ontology/ssot/design-system-assets.yaml`.

## Entry Point

```css
@import "@eqds/tokens/tokens.css";
```

Local source:

- `src/tokens.css`
- `Equal — Accessibility Design System/drop_in/equal-research-ui/tokens.css`
- `dist/tokens.dtcg.json`
- `dist/tokens.report.md`
- `ontology/ssot/design-system-assets.yaml#dtcg_tokens`

Regenerate with:

```sh
python3 ontology/scripts/sync_packages.py
python3 ontology/scripts/sync_design_system_assets.py
python3 scripts/check_design_system_assets.py
```
