import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { type ReactNode, useEffect } from 'react';

type Props = {
  children: ReactNode;
};

function BrowserThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const frame = requestAnimationFrame(() => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--eq-bg').trim();
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableColorScheme
      enableSystem
      storageKey="chronicle-theme"
    >
      <BrowserThemeColor />
      {children}
    </NextThemesProvider>
  );
}
