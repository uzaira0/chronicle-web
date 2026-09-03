import { Monitor, MoonStar, SunMedium } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslator } from '@/i18n';

const themes = [
  { icon: SunMedium, labelKey: 'theme.light', value: 'light' },
  { icon: MoonStar, labelKey: 'theme.dark', value: 'dark' },
  { icon: Monitor, labelKey: 'theme.system', value: 'system' },
] as const;

export function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const { t } = useTranslator();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button aria-label={t('theme.loading')} size="icon" variant="outline">
        <SunMedium className="h-4 w-4 opacity-50" />
      </Button>
    );
  }

  const activeTheme = theme === 'system' ? (resolvedTheme ?? 'system') : (theme ?? 'system');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t('theme.toggle')} size="icon" variant="outline">
          {activeTheme === 'dark' ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map(({ icon: Icon, labelKey, value }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon className="mr-2 h-4 w-4" />
            {t(labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
