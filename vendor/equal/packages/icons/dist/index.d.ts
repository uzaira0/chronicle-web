import type * as React from 'react';

export type EqualIconName = 'search' | 'copy' | 'settings' | 'close' | 'check' | 'warning' | 'info' | 'chevron_down' | 'upload' | 'file_text' | 'menu' | 'external_link';
export interface EqualIconProps {
  name: EqualIconName | string;
  label?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}
export type EqualIconComponent = (props: EqualIconProps) => React.ReactElement | null;
export declare const sourceOfTruth: string;
export declare const iconMap: { [name in EqualIconName]?: EqualIconComponent };
export declare function EqualIcon(props: { name: string; label?: string; size?: number; strokeWidth?: number; className?: string }): React.ReactElement | null;
