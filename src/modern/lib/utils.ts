import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Keep in sync with the custom @theme tokens in styles/index.css, or overrides stop merging.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      container: ['dialog'],
      text: ['2xs', '3xs'],
      tracking: ['label', 'eyebrow', 'eyebrow-wide'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
