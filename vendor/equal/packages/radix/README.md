# @eqds/radix

Radix wrappers for Equal. These wrappers keep Radix behavior authoritative for focus management, portals, keyboard support, and `asChild` composition while applying Equal classes and tokens.

```jsx
import { Dialog, RadixButton } from "@eqds/radix";

<Dialog.Root>
  <Dialog.Trigger asChild>
    <RadixButton variant="primary">Open review</RadixButton>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Review evidence</Dialog.Title>
      <Dialog.Description>Confirm the attached proof before release.</Dialog.Description>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

Add new primitive wrappers by first recording the integration in `ontology/ssot/integrations.yaml`, then regenerating packages.
