// Generated from Equal Research UI package contract by ontology/scripts/sync_packages.py. Do not edit by hand.
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function RadixButton({ asChild = false, variant = 'secondary', className, ...props }) {
  const Comp = asChild ? Slot : 'button';
  const variantClass = variant === 'primary' ? 'eq-btn--primary' : variant === 'danger' ? 'eq-btn--danger' : '';
  return React.createElement(Comp, { ...props, className: cx('eq-btn', variantClass, className) });
}

export const Dialog = {
  Root: DialogPrimitive.Root,
  Trigger: DialogPrimitive.Trigger,
  Close: DialogPrimitive.Close,
  Portal: DialogPrimitive.Portal,
  Overlay: ({ className, ...props }) => React.createElement(DialogPrimitive.Overlay, { ...props, className: cx('eq-overlay', className) }),
  Content: ({ className, ...props }) => React.createElement(DialogPrimitive.Content, { ...props, className: cx('eq-dialog', className) }),
  Title: ({ className, ...props }) => React.createElement(DialogPrimitive.Title, { ...props, className: cx('eq-dialog-title', className) }),
  Description: ({ className, ...props }) => React.createElement(DialogPrimitive.Description, { ...props, className: cx('eq-muted', className) }),
};

export const Popover = {
  Root: PopoverPrimitive.Root,
  Trigger: PopoverPrimitive.Trigger,
  Portal: PopoverPrimitive.Portal,
  Content: ({ className, sideOffset = 8, ...props }) => React.createElement(PopoverPrimitive.Content, { ...props, sideOffset, className: cx('eq-popover', className) }),
};

export const Tooltip = {
  Provider: TooltipPrimitive.Provider,
  Root: TooltipPrimitive.Root,
  Trigger: TooltipPrimitive.Trigger,
  Portal: TooltipPrimitive.Portal,
  Content: ({ className, sideOffset = 6, ...props }) => React.createElement(TooltipPrimitive.Content, { ...props, sideOffset, className: cx('eq-tooltip', className) }),
};

export const Tabs = {
  Root: TabsPrimitive.Root,
  List: ({ className, ...props }) => React.createElement(TabsPrimitive.List, { ...props, className: cx('eq-tabs', className) }),
  Trigger: ({ className, ...props }) => React.createElement(TabsPrimitive.Trigger, { ...props, className: cx('eq-tab', className) }),
  Content: ({ className, ...props }) => React.createElement(TabsPrimitive.Content, { ...props, className: cx('eq-tab-panel', className) }),
};

export const Accordion = {
  Root: AccordionPrimitive.Root,
  Item: ({ className, ...props }) => React.createElement(AccordionPrimitive.Item, { ...props, className: cx('eq-accordion-item', className) }),
  Header: AccordionPrimitive.Header,
  Trigger: ({ className, ...props }) => React.createElement(AccordionPrimitive.Trigger, { ...props, className: cx('eq-accordion-trigger', className) }),
  Content: ({ className, ...props }) => React.createElement(AccordionPrimitive.Content, { ...props, className: cx('eq-accordion-content', className) }),
};

export const DropdownMenu = {
  Root: DropdownMenuPrimitive.Root,
  Trigger: DropdownMenuPrimitive.Trigger,
  Portal: DropdownMenuPrimitive.Portal,
  Content: ({ className, sideOffset = 6, ...props }) => React.createElement(DropdownMenuPrimitive.Content, { ...props, sideOffset, className: cx('eq-menu', className) }),
  Item: ({ className, ...props }) => React.createElement(DropdownMenuPrimitive.Item, { ...props, className: cx('eq-menu-item', className) }),
  CheckboxItem: ({ className, ...props }) => React.createElement(DropdownMenuPrimitive.CheckboxItem, { ...props, className: cx('eq-menu-item', className) }),
  RadioGroup: DropdownMenuPrimitive.RadioGroup,
  RadioItem: ({ className, ...props }) => React.createElement(DropdownMenuPrimitive.RadioItem, { ...props, className: cx('eq-menu-item', className) }),
  Separator: ({ className, ...props }) => React.createElement(DropdownMenuPrimitive.Separator, { ...props, className: cx('eq-menu-separator', className) }),
  Label: ({ className, ...props }) => React.createElement(DropdownMenuPrimitive.Label, { ...props, className: cx('eq-menu-label', className) }),
  ItemIndicator: DropdownMenuPrimitive.ItemIndicator,
};
