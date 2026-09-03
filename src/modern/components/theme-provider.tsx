import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type * as React from 'react';

type Props = {
  children: React.ReactNode;
};

export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableColorScheme
      enableSystem
      storageKey="chronicle-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
