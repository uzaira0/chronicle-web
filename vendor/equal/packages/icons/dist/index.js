// Generated from Equal Research UI package contract by ontology/scripts/sync_packages.py. Do not edit by hand.
import * as React from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, FileText, Info, Menu, Search, Settings, Upload, X } from 'lucide-react';

export const sourceOfTruth = 'ontology/ssot/integrations.yaml#icon_map';
export const iconMap = {
  "search": Search,
  "copy": Copy,
  "settings": Settings,
  "close": X,
  "check": Check,
  "warning": AlertTriangle,
  "info": Info,
  "chevron_down": ChevronDown,
  "upload": Upload,
  "file_text": FileText,
  "menu": Menu,
  "external_link": ExternalLink
};

export function EqualIcon({ name, label, size = 20, strokeWidth = 2, className = 'eq-icon', ...props }) {
  const Icon = iconMap[name] || Info;
  const accessibilityProps = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true, focusable: false };
  return React.createElement(Icon, {
    ...props,
    ...accessibilityProps,
    size,
    strokeWidth,
    className,
  });
}

export { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, FileText, Info, Menu, Search, Settings, Upload, X };
