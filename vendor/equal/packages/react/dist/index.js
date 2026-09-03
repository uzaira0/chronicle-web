// Generated from Equal Research UI package contract by ontology/scripts/sync_packages.py. Do not edit by hand.
import * as React from 'react';

export const packageStatus = 'candidate';
export const sourceOfTruth = 'ontology/catalog.yaml + ontology/ssot/*.yaml';
export const designReference = 'Equal — Accessibility Design System/drop_in/equal-research-ui/DESIGN.md';
export const cssEntry = '@eqds/css/equal.css';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function createEqualComponent(displayName, category) {
  const Component = ({ as = 'div', className, children, ...props }) =>
    React.createElement(as, { ...props, 'data-eq-component': displayName, 'data-eq-category': category, className: cx('eq-card', `eq-${category}`, className) }, children);
  Component.displayName = displayName;
  return Component;
}

export function Button({ variant = 'secondary', className, ...props }) {
  const variantClass = variant === 'primary' ? 'eq-btn--primary' : variant === 'danger' ? 'eq-btn--danger' : '';
  const content = props.loading ? React.createElement(React.Fragment, null, React.createElement('span', { role: 'status', 'aria-live': 'polite' }, 'Loading'), props.children) : props.children;
  return React.createElement('button', { ...props, type: props.type || 'button', disabled: props.disabled || props.loading, 'aria-busy': props.loading || undefined, className: cx('eq-btn', variantClass, className) }, content);
}

export function ButtonGroup({ label, orientation = 'horizontal', className, children, ...props }) {
  return React.createElement('div', { ...props, role: 'group', 'aria-label': label, 'aria-orientation': orientation, className: cx('eq-button-group', className) }, children);
}

export function SplitButton({ label = 'Primary action', menuLabel = 'More actions', options = [], className, children, ...props }) {
  return React.createElement(
    'div',
    { className: cx('eq-split-button', className), role: 'group', 'aria-label': label },
    React.createElement(Button, { ...props, variant: props.variant || 'primary' }, children || label),
    React.createElement('button', { type: 'button', className: 'eq-btn eq-btn--secondary', 'aria-haspopup': 'menu', 'aria-expanded': false, 'aria-label': menuLabel }, 'Options'),
    React.createElement('div', { role: 'menu', hidden: true }, options.map((option) => React.createElement('button', { key: option, type: 'button', role: 'menuitem' }, option)))
  );
}

export function CopyButton({ value = '', copiedLabel = 'Copied', readyLabel = 'Copy', className, ...props }) {
  const [copied, setCopied] = React.useState(false);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('button', { ...props, type: 'button', className: cx('eq-btn', className), onClick: () => { setCopied(true); if (props.onCopy) props.onCopy(value); } }, copied ? copiedLabel : readyLabel),
    React.createElement('span', { role: 'status', 'aria-live': 'polite', className: 'eq-visually-hidden' }, copied ? copiedLabel : '')
  );
}

export function IconButton({ label, children, className, ...props }) {
  if (!label) throw new Error('Equal IconButton requires a visible or programmatic label.');
  return React.createElement(
    'button',
    { ...props, type: props.type || 'button', 'aria-label': label, className: cx('eq-icon-btn', className) },
    children
  );
}

export function Link({ className, ...props }) {
  return React.createElement('a', { ...props, className: cx('eq-link', className) });
}

export function Card({ as = 'section', className, ...props }) {
  return React.createElement(as, { ...props, className: cx('eq-card', className) });
}

export function Panel({ as = 'div', className, ...props }) {
  return React.createElement(as, { ...props, className: cx('eq-panel', className) });
}

export function Alert({ tone = 'warning', className, ...props }) {
  return React.createElement('div', { ...props, role: props.role || 'status', 'data-tone': tone, className: cx('eq-alert', className) });
}

export function Status({ children, className, ...props }) {
  return React.createElement('span', { ...props, className: cx('eq-status', className) }, children);
}

export function Field({ label, description, children, className, ...props }) {
  return React.createElement(
    'label',
    { ...props, className: cx('eq-field', className) },
    React.createElement('span', { className: 'eq-label' }, label),
    children,
    description ? React.createElement('span', { className: 'eq-muted' }, description) : null
  );
}

export function Input({ className, ...props }) {
  return React.createElement('input', { ...props, className: cx('eq-input', className) });
}

export function SearchInput({ className, ...props }) {
  return React.createElement(Input, { ...props, type: 'search', className });
}

export function DateInput({ className, ...props }) {
  return React.createElement(Input, { ...props, type: 'date', className });
}

export function TimeInput({ className, ...props }) {
  return React.createElement(Input, { ...props, type: 'time', className });
}

export function Textarea({ className, ...props }) {
  return React.createElement('textarea', { ...props, className: cx('eq-textarea', className) });
}

export function Fieldset({ legend, description, className, children, ...props }) {
  return React.createElement('fieldset', { ...props, className: cx('eq-fieldset', className) }, React.createElement('legend', null, legend), description ? React.createElement('p', { className: 'eq-muted' }, description) : null, children);
}

export function Checkbox({ label, className, ...props }) {
  return React.createElement('label', { className: cx('eq-check', className) }, React.createElement('input', { ...props, type: 'checkbox' }), React.createElement('span', null, label));
}

export function Radio({ label, className, ...props }) {
  return React.createElement('label', { className: cx('eq-check', className) }, React.createElement('input', { ...props, type: 'radio' }), React.createElement('span', null, label));
}

export function Switch({ label, checked = false, className, ...props }) {
  return React.createElement('button', { ...props, type: 'button', role: 'switch', 'aria-checked': checked, className: cx('eq-switch', className) }, label);
}

export function Slider({ label, className, ...props }) {
  return React.createElement('label', { className: cx('eq-field', className) }, React.createElement('span', { className: 'eq-label' }, label), React.createElement('input', { ...props, type: 'range' }));
}

export function Select({ labelId, value, options = [], className, ...props }) {
  return React.createElement(
    'div',
    { className: cx('eq-select', className), 'data-eq-select': true },
    React.createElement(
      'button',
      { ...props, type: 'button', className: 'eq-select-button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-labelledby': labelId },
      React.createElement('span', { 'data-eq-select-value': true }, value),
      React.createElement('span', { 'aria-hidden': 'true' }, 'v')
    ),
    React.createElement(
      'ul',
      { className: 'eq-select-list', role: 'listbox', hidden: true },
      options.map((option) =>
        React.createElement(
          'li',
          { key: option },
          React.createElement('button', { className: 'eq-select-option', type: 'button', role: 'option', 'aria-selected': option === value }, option)
        )
      )
    )
  );
}

export const Combobox = Select;

export function ValidationSummary({ title = 'Review errors', errors = [], className, ...props }) {
  return React.createElement('div', { ...props, role: props.role || 'alert', className: cx('eq-validation-summary', className) }, React.createElement('h2', null, title), React.createElement('ul', null, errors.map((error) => React.createElement('li', { key: error.id }, error.href ? React.createElement('a', { href: error.href }, error.label) : error.label))));
}

export const ErrorSummary = ValidationSummary;

export function InlineError({ id, children, className, ...props }) {
  return React.createElement('p', { ...props, id, className: cx('eq-inline-error', className) }, children);
}

export function CharacterCount({ value = '', max = 200, className, ...props }) {
  const remaining = max - String(value).length;
  return React.createElement('p', { ...props, role: remaining < 0 ? 'alert' : 'status', className: cx('eq-character-count', className) }, `${Math.max(remaining, 0)} characters remaining`);
}

export function Table({ children, className, ...props }) {
  return React.createElement('div', { className: 'eq-table-wrap' }, React.createElement('table', { ...props, className: cx('eq-table', className) }, children));
}

export function SortableTable({ caption, columns = [], rows = [], className, ...props }) {
  return React.createElement('div', { className: 'eq-table-wrap' }, React.createElement('table', { ...props, className: cx('eq-table', className) }, caption ? React.createElement('caption', null, caption) : null, React.createElement('thead', null, React.createElement('tr', null, columns.map((column) => React.createElement('th', { key: column, scope: 'col', 'aria-sort': 'none' }, column)))), React.createElement('tbody', null, rows.map((row, index) => React.createElement('tr', { key: index }, row.map((cell, cellIndex) => React.createElement('td', { key: cellIndex }, cell)))))));
}

export function DescriptionList({ items = [], className, ...props }) {
  return React.createElement('dl', { ...props, className: cx('eq-description-list', className) }, items.map((item) => React.createElement(React.Fragment, { key: item.term }, React.createElement('dt', null, item.term), React.createElement('dd', null, item.description))));
}

export function Metric({ value, label, trend, className, ...props }) {
  return React.createElement('figure', { ...props, className: cx('eq-metric', className) }, React.createElement('strong', null, value), React.createElement('figcaption', null, label), trend ? React.createElement('span', null, trend) : null);
}

export function Timeline({ events = [], className, ...props }) {
  return React.createElement('ol', { ...props, className: cx('eq-timeline', className) }, events.map((event) => React.createElement('li', { key: event.id }, React.createElement('strong', null, event.label), event.time ? React.createElement('time', null, event.time) : null)));
}

export function LogViewer({ code = '', copyLabel = 'Copy log line', className, ...props }) {
  return React.createElement('section', { ...props, className: cx('eq-log-viewer', className) }, React.createElement('button', { type: 'button', className: 'eq-btn eq-btn--secondary' }, copyLabel), React.createElement('pre', { tabIndex: 0 }, React.createElement('code', null, code)));
}

export function EvidencePacket({ title = 'Evidence packet', items = [], className, ...props }) {
  return React.createElement(Card, { ...props, className: cx('eq-evidence-packet', className) }, React.createElement('h3', null, title), React.createElement(DescriptionList, { items }));
}

export function ProvenanceMarker({ children = 'Source verified', className, ...props }) {
  return React.createElement('span', { ...props, className: cx('eq-provenance-marker', className) }, children);
}

export function SkipLink({ href = '#main', children = 'Skip to main content', className, ...props }) {
  return React.createElement('a', { ...props, href, className: cx('eq-skip-link', className) }, children);
}

export function AnchorNav({ label = 'Page sections', links = [], className, ...props }) {
  return React.createElement('nav', { ...props, 'aria-label': label, className: cx('eq-anchor-nav', className) }, links.map((link) => React.createElement('a', { key: link.href, href: link.href }, link.label)));
}

export function CommandPalette({ open = false, label = 'Command palette', commands = [], query = '', className, ...props }) {
  return React.createElement('div', { ...props, role: 'dialog', 'aria-label': label, hidden: !open, className: cx('eq-command-palette', className) }, React.createElement('input', { className: 'eq-input', value: query, readOnly: true, 'aria-label': 'Command search' }), React.createElement('div', { role: 'listbox' }, commands.map((command) => React.createElement('div', { key: command.id, role: 'option', 'aria-selected': false }, command.label))));
}

export function RailCard({ className, ...props }) {
  return React.createElement(Card, { ...props, className: cx('eq-rail', className) });
}

export function NotebookCard({ className, ...props }) {
  return React.createElement(Card, { ...props, className: cx('eq-notebook', className) });
}

export function Stamp({ count = 5, className, ...props }) {
  return React.createElement(
    'div',
    { ...props, className: cx('eq-stamp', className), 'aria-hidden': props['aria-hidden'] ?? true },
    Array.from({ length: count }, (_, index) => React.createElement('span', { key: index }))
  );
}

export function StepLedger({ steps = [], className, ...props }) {
  return React.createElement(
    'div',
    { ...props, className: cx('eq-step-ledger', className) },
    steps.map((step) => React.createElement('span', { key: step }, step))
  );
}
export const Badge = createEqualComponent('Badge', 'feedback');
export const Tag = createEqualComponent('Tag', 'feedback');
export const Toast = createEqualComponent('Toast', 'feedback');
export const Tooltip = createEqualComponent('Tooltip', 'feedback');
export const Progress = createEqualComponent('Progress', 'feedback');
export const Skeleton = createEqualComponent('Skeleton', 'feedback');
export const Spinner = createEqualComponent('Spinner', 'feedback');
export const Dialog = createEqualComponent('Dialog', 'overlay');
export const Drawer = createEqualComponent('Drawer', 'overlay');
export const Popover = createEqualComponent('Popover', 'overlay');
export const Menu = createEqualComponent('Menu', 'overlay');
export const Accordion = createEqualComponent('Accordion', 'disclosure');
export const Tabs = createEqualComponent('Tabs', 'navigation');
export const Breadcrumb = createEqualComponent('Breadcrumb', 'navigation');
export const Pagination = createEqualComponent('Pagination', 'navigation');
export const Steps = createEqualComponent('Steps', 'navigation');
export const Sidebar = createEqualComponent('Sidebar', 'layout');
export const TopBar = createEqualComponent('TopBar', 'layout');
export const Avatar = createEqualComponent('Avatar', 'data_display');
export const EmptyState = createEqualComponent('EmptyState', 'feedback');
export const CodeBlock = createEqualComponent('CodeBlock', 'code');
export const FileUpload = createEqualComponent('FileUpload', 'upload');
