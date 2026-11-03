import { Cpu } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { translateCatalog, useTranslator } from '@/i18n';
import { COLLECTION_MODULES } from '@/lib/study-constants';

type AndroidSensorSettings = {
  dutyCycleActiveSeconds?: number;
  dutyCyclePeriodSeconds?: number;
  samplingRateHz?: number;
};

type StudySensorsCardProps = {
  collectionSettings: Record<string, { enabled?: boolean; sensorPolicy?: AndroidSensorSettings | null }>;
};

/**
 * Sampling cadence, reported only where the study actually configured it.
 *
 * Absent fields show as not configured, never as a default a researcher could mistake for
 * a real setting. `samplingRateHz: 0` stays 0, and no idle time is printed when the active
 * window exceeds the period.
 */
function CadenceSummary({ settings }: { settings: AndroidSensorSettings }) {
  const { t } = useTranslator();
  const rate = settings.samplingRateHz;
  const active = settings.dutyCycleActiveSeconds;
  const period = settings.dutyCyclePeriodSeconds;

  const hasRate = typeof rate === 'number' && Number.isFinite(rate);
  const hasDutyCycle =
    typeof active === 'number' && Number.isFinite(active) && typeof period === 'number' && Number.isFinite(period);

  if (!hasRate && !hasDutyCycle) {
    return <p className="text-xs text-muted-foreground">{t('sensors_card.not_configured')}</p>;
  }

  return (
    <p className="text-xs text-muted-foreground">
      {hasRate && <strong className="text-foreground">{t('sensors_card.hz', { rate: String(rate) })}</strong>}
      {hasRate && hasDutyCycle && ' · '}
      {/* Reported as active-in-period rather than active/idle: idle is only meaningful when
          the period exceeds the active window, and neither field is guaranteed to be set. */}
      {hasDutyCycle && (
        <>
          <strong className="text-foreground">{active}s</strong> {t('sensors_card.cycle_active')}{' '}
          <strong className="text-foreground">{period}s</strong> {t('sensors_card.cycle_suffix')}
        </>
      )}
    </p>
  );
}

/** Android and iOS sensor configuration in one card. */
export function StudySensorsCard({ collectionSettings }: StudySensorsCardProps) {
  const { t } = useTranslator();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            {t('sensors_card.title')}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent spacing={4} size="small">
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('common.android')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLLECTION_MODULES.filter((module) => module.sensorType).map(({ label, value }) => {
              const setting = collectionSettings[value];
              return (
                <div className="space-y-1" key={value}>
                  <Badge variant={setting?.enabled ? 'success' : 'muted'}>
                    {translateCatalog(t, 'module', value, label)}
                  </Badge>
                  {setting?.enabled && <CadenceSummary settings={setting.sensorPolicy ?? {}} />}
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{t('sensors_card.consent_note')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
