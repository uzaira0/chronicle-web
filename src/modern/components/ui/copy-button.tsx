import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { copyToClipboard } from '@/lib/participant-links';

type CopyButtonProps = ButtonProps & {
  value: string;
};

export function CopyButton({ value, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslator();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;
    copyToClipboard(value)
      .then((ok) => {
        if (ok) {
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), 2000);
        }
      })
      .catch(() => {
        setCopied(false);
      });
  };

  return (
    <Button
      size="icon"
      variant="outline"
      title={copied ? t('common.copied') : t('common.copy_to_clipboard')}
      {...props}
      aria-label={copied ? t('common.copied') : props['aria-label'] || t('common.copy_to_clipboard')}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}
