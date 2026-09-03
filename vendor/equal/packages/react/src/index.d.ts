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

export declare const packageStatus: 'candidate';
export declare const sourceOfTruth: string;
export declare function Field(props: EqualBaseProps & { label: string; description?: string }): unknown;
export declare function Button(props: EqualButtonProps): unknown;
export declare function IconButton(props: EqualIconButtonProps): unknown;
export declare function Link(props: EqualLinkProps): unknown;
export declare function Input(props: EqualInputProps): unknown;
export declare function Textarea(props: EqualTextareaProps): unknown;
export declare function Checkbox(props: EqualChoiceProps): unknown;
export declare function Radio(props: EqualChoiceProps): unknown;
export declare function Switch(props: EqualSwitchProps): unknown;
export declare function Slider(props: EqualSliderProps): unknown;
export declare function Select(props: EqualSelectProps): unknown;
export declare function Combobox(props: EqualSelectProps): unknown;
export declare function Alert(props: EqualAlertProps): unknown;
export declare function Badge(props: EqualGeneratedComponentProps): unknown;
export declare function Tag(props: EqualGeneratedComponentProps): unknown;
export declare function Toast(props: EqualGeneratedComponentProps): unknown;
export declare function Tooltip(props: EqualGeneratedComponentProps): unknown;
export declare function Progress(props: EqualGeneratedComponentProps): unknown;
export declare function Skeleton(props: EqualGeneratedComponentProps): unknown;
export declare function Spinner(props: EqualGeneratedComponentProps): unknown;
export declare function Dialog(props: EqualGeneratedComponentProps): unknown;
export declare function Drawer(props: EqualGeneratedComponentProps): unknown;
export declare function Popover(props: EqualGeneratedComponentProps): unknown;
export declare function Menu(props: EqualGeneratedComponentProps): unknown;
export declare function Accordion(props: EqualGeneratedComponentProps): unknown;
export declare function Tabs(props: EqualGeneratedComponentProps): unknown;
export declare function Breadcrumb(props: EqualGeneratedComponentProps): unknown;
export declare function Pagination(props: EqualGeneratedComponentProps): unknown;
export declare function Steps(props: EqualGeneratedComponentProps): unknown;
export declare function Sidebar(props: EqualGeneratedComponentProps): unknown;
export declare function TopBar(props: EqualGeneratedComponentProps): unknown;
export declare function Table(props: EqualTableProps): unknown;
export declare function Card(props: EqualCardProps): unknown;
export declare function Avatar(props: EqualGeneratedComponentProps): unknown;
export declare function EmptyState(props: EqualGeneratedComponentProps): unknown;
export declare function CodeBlock(props: EqualGeneratedComponentProps): unknown;
export declare function FileUpload(props: EqualGeneratedComponentProps): unknown;
export declare function ButtonGroup(props: EqualButtonGroupProps): unknown;
export declare function SplitButton(props: EqualSplitButtonProps): unknown;
export declare function CopyButton(props: EqualButtonProps): unknown;
export declare function SearchInput(props: EqualInputProps): unknown;
export declare function DateInput(props: EqualInputProps): unknown;
export declare function TimeInput(props: EqualInputProps): unknown;
export declare function Fieldset(props: EqualFieldsetProps): unknown;
export declare function ValidationSummary(props: EqualValidationSummaryProps): unknown;
export declare function ErrorSummary(props: EqualValidationSummaryProps): unknown;
export declare function InlineError(props: EqualStatusMessageProps): unknown;
export declare function CharacterCount(props: EqualStatusMessageProps): unknown;
export declare function SkipLink(props: EqualGeneratedComponentProps): unknown;
export declare function AnchorNav(props: EqualGeneratedComponentProps): unknown;
export declare function CommandPalette(props: EqualCommandPaletteProps): unknown;
export declare function SortableTable(props: EqualTableProps): unknown;
export declare function DescriptionList(props: EqualDataDisplayProps): unknown;
export declare function Metric(props: EqualMetricProps): unknown;
export declare function Timeline(props: EqualTimelineProps): unknown;
export declare function LogViewer(props: EqualCodeBlockProps): unknown;
export declare function EvidencePacket(props: EqualDataDisplayProps): unknown;
export declare function ProvenanceMarker(props: EqualStatusMessageProps): unknown;
export declare function NotebookCard(props: EqualCardProps): unknown;
export declare function RailCard(props: EqualCardProps): unknown;
export declare function Stamp(props: EqualStampProps): unknown;
export declare function StepLedger(props: EqualStepLedgerProps): unknown;
