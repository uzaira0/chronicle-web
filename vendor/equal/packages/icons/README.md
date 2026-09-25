# @eqds/icons

Semantic icon adapter for Equal. It imports actual `lucide-react` components and maps them to stable design-system names such as `search`, `copy`, `settings`, and `warning`.

```jsx
import { EqualIcon } from "@eqds/icons";

<EqualIcon name="search" label="Search records" />;
<EqualIcon name="copy" aria-hidden />;
```

Icon additions belong upstream (`ontology/ssot/integrations.yaml#icon_map` in the Equal source, not in this repo); see `vendor/equal/PROVENANCE.md`. Downstream apps tree-shake the imported Lucide icons.
