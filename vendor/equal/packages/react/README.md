# @eqds/react

React package for Equal primitives. It provides lightweight class-based wrappers around the validated CSS/drop-in element contract.

## Generated Export Contract

The implementation and declarations are generated from `ontology/catalog.yaml` plus `ontology/ssot/design-system-assets.yaml`.

- Core helpers: `Field`, `Panel`, `Status`.
- Explicit primitives: `Button`, `IconButton`, `Link`, `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Radio`, `Switch`, `Slider`, `Alert`, `Table`, `Card`.
- Research patterns: `NotebookCard`, `RailCard`, `Stamp`, `StepLedger`.
- Remaining catalog components are exported as generated Equal wrappers using their catalog labels, such as `Badge`, `Tag`, `Toast`, `Tooltip`, `Progress`, `Skeleton`, `Spinner`, `Dialog`, `Drawer`, `Popover`, `Menu`, `Accordion`, `Tabs`, `Breadcrumb`, `Pagination`, `Steps`, `Sidebar`, `TopBar`, `Avatar`, `EmptyState`, `CodeBlock`, and `FileUpload`.

The wrappers require `@eqds/css/equal.css` and the progressive enhancement script from the drop-in kit when using the custom dropdown behavior.

Regenerate with:

```sh
python3 ontology/scripts/sync_packages.py
```
