import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router';

import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';

export function NotFoundPage() {
  const { t } = useTranslator();
  return (
    <div className="space-y-6">
      <SectionHeader
        description={t('not_found.description')}
        eyebrow="404"
        icon={<Compass className="h-3.5 w-3.5" />}
        title={t('not_found.title')}
      />

      <StatePanel
        actions={
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('not_found.back')}
            </Link>
          </Button>
        }
        className="max-w-none"
        description={t('not_found.fallback_description')}
        icon={<Compass className="h-5 w-5" />}
        eyebrow={t('not_found.fallback_eyebrow')}
        title={t('not_found.fallback_title')}
      />
    </div>
  );
}
