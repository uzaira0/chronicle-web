export type EqualTone = 'primary' | 'secondary' | 'danger' | 'ghost';
export type EqualStatusTone = 'info' | 'success' | 'warning' | 'danger';
export interface EqualBaseProps {
  className?: string;
  children?: unknown;
}
export interface EqualGeneratedComponentProps extends EqualBaseProps {
  as?: string;
  id?: string;
}
export interface EqualButtonProps extends EqualBaseProps {
  type?: 'button' | 'submit' | 'reset';
  variant?: EqualTone;
  disabled?: boolean;
  'aria-label'?: string;
}
export interface EqualButtonGroupProps extends EqualBaseProps {
  orientation?: 'horizontal' | 'vertical';
  labelledBy?: string;
}
export interface EqualSplitButtonProps extends EqualButtonProps {
  menuLabel?: string;
  options?: string[];
}
export interface EqualIconButtonProps extends EqualButtonProps {
  label: string;
}
export interface EqualLinkProps extends EqualBaseProps {
  href: string;
  target?: string;
  rel?: string;
}
export interface EqualInputProps extends EqualBaseProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}
export interface EqualTextareaProps extends EqualInputProps {
  rows?: number;
}
export interface EqualChoiceProps extends EqualBaseProps {
  label?: string;
  name?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
}
export interface EqualSwitchProps extends EqualBaseProps {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
}
export interface EqualSliderProps extends EqualBaseProps {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
}
export interface EqualSelectProps extends EqualBaseProps {
  labelId?: string;
  value?: string;
  options?: string[];
  disabled?: boolean;
}
export interface EqualAlertProps extends EqualBaseProps {
  tone?: EqualStatusTone;
  role?: 'status' | 'alert' | 'note';
}
export interface EqualFieldsetProps extends EqualBaseProps {
  legend: string;
  describedBy?: string;
  disabled?: boolean;
}
export interface EqualValidationSummaryProps extends EqualBaseProps {
  title?: string;
  errors?: Array<{ id: string; label: string; href?: string }>;
  role?: 'alert' | 'status';
}
export interface EqualStatusMessageProps extends EqualBaseProps {
  id?: string;
  tone?: EqualStatusTone;
  htmlFor?: string;
}
export interface EqualCommandPaletteProps extends EqualBaseProps {
  open?: boolean;
  label?: string;
  query?: string;
  commands?: Array<{ id: string; label: string; shortcut?: string }>;
}
export interface EqualTableProps extends EqualBaseProps {
  caption?: string;
  sortable?: boolean;
}
export interface EqualDataDisplayProps extends EqualBaseProps {
  title?: string;
  items?: Array<{ term: string; description: string }>;
}
export interface EqualMetricProps extends EqualBaseProps {
  label?: string;
  value?: string | number;
  trend?: string;
}
export interface EqualTimelineProps extends EqualBaseProps {
  events?: Array<{ id: string; label: string; time?: string; status?: string }>;
}
export interface EqualCodeBlockProps extends EqualBaseProps {
  code?: string;
  language?: string;
  copyLabel?: string;
}
export interface EqualCardProps extends EqualBaseProps {
  as?: string;
}
export interface EqualStampProps extends EqualBaseProps {
  count?: number;
  'aria-hidden'?: boolean;
}
export interface EqualStepLedgerProps extends EqualBaseProps {
  steps?: string[];
}

export declare function RadixButton(props: EqualBaseProps & { asChild?: boolean; variant?: EqualTone }): unknown;
export interface EqualOverlayParts {
  Root: unknown;
  Trigger: unknown;
  Portal?: unknown;
  Content?: unknown;
}
export interface EqualDialogParts extends EqualOverlayParts {
  Close: unknown;
  Overlay: unknown;
  Title: unknown;
  Description: unknown;
}
export interface EqualTabsParts {
  Root: unknown;
  List: unknown;
  Trigger: unknown;
  Content: unknown;
}
export interface EqualAccordionParts {
  Root: unknown;
  Item: unknown;
  Header: unknown;
  Trigger: unknown;
  Content: unknown;
}
export interface EqualDropdownMenuParts extends EqualOverlayParts {
  Item: unknown;
  CheckboxItem: unknown;
  RadioGroup: unknown;
  RadioItem: unknown;
  Separator: unknown;
  Label: unknown;
  ItemIndicator: unknown;
}
export declare const Dialog: EqualDialogParts;
export declare const Popover: EqualOverlayParts;
export declare const Tooltip: EqualOverlayParts & { Provider: unknown };
export declare const Tabs: EqualTabsParts;
export declare const Accordion: EqualAccordionParts;
export declare const DropdownMenu: EqualDropdownMenuParts;
