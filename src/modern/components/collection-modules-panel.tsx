import { ChevronRight, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { translateCatalog, useTranslator } from '@/i18n';
import { healthConnectRecordTypeLabel } from '@/lib/study-constants';
import { cn } from '@/lib/utils';

type CollectionModuleDescriptor = {
  description: string;
  label: string;
  privacyClass: string;
  value: string;
};

type ModuleSetting = {
  disableDisposition?: unknown;
  enabled?: boolean;
  healthConnectRecordTypes?: unknown;
  required?: boolean;
};

type CollectionModulesPanelProps = {
  /** The settings request failed; nothing about enablement is known. */
  isError?: boolean;
  /** The settings request is still open; nothing about enablement is known yet. */
  isLoading?: boolean;
  modules: readonly CollectionModuleDescriptor[];
  settings: Record<string, ModuleSetting | undefined>;
};

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type ResolvedModule = CollectionModuleDescriptor & {
  disposition: string | undefined;
  enabled: boolean;
  healthConnectRecordTypes: string[];
  required: boolean;
};

/**
 * Study data-collection state, summarized rather than enumerated.
 *
 * The previous layout rendered one full-size card per module — 31 near-identical
 * boxes, each with a paragraph and a green "Active" badge, which pushed the real
 * signal (what deviates from the default) off the first screen. Here the summary
 * and the exceptions lead; the exhaustive per-module list stays one click away.
 */
export function CollectionModulesPanel({
  isError = false,
  isLoading = false,
  modules,
  settings,
}: CollectionModulesPanelProps) {
  const { t } = useTranslator();
  const resolved = useMemo<ResolvedModule[]>(
    () =>
      modules.map((module) => {
        const setting = settings[module.value];
        const disableDisposition = setting?.disableDisposition;
        return {
          ...module,
          disposition:
            typeof disableDisposition === 'string'
              ? translateCatalog(t, 'disposition', disableDisposition, titleCase(disableDisposition))
              : undefined,
          enabled: setting?.enabled ?? false,
          healthConnectRecordTypes: Array.isArray(setting?.healthConnectRecordTypes)
            ? [
                ...new Set(
                  setting.healthConnectRecordTypes.filter((value): value is string => typeof value === 'string'),
                ),
              ]
            : [],
          required: setting?.required ?? false,
        };
      }),
    [modules, settings, t],
  );

  const active = resolved.filter((module) => module.enabled);
  const inactive = resolved.filter((module) => !module.enabled);
  const required = active.filter((module) => module.required);
  const healthConnect = active.find((module) => module.value === 'health_connect');

  const groups = useMemo(() => {
    const byClass = new Map<string, ResolvedModule[]>();
    for (const module of resolved) {
      const bucket = byClass.get(module.privacyClass);
      if (bucket) {
        bucket.push(module);
      } else {
        byClass.set(module.privacyClass, [module]);
      }
    }
    return [...byClass.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [resolved]);

  // Absent settings are indistinguishable from settings that say "off", so while the
  // request is open or after it fails the panel must not claim "0 of N active" and list
  // every module as not collected — for a study that collects everything that is the
  // exact opposite of the truth.
  if (isLoading || isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t('modules_panel.title')}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isLoading ? t('modules_panel.loading') : t('modules_panel.error')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t('modules_panel.title')}
          </div>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={active.length > 0 ? 'success' : 'muted'}>
            {t('modules_panel.active_count', { active: String(active.length), total: String(resolved.length) })}
          </Badge>
          {required.length > 0 && (
            <Badge variant="outline">{t('modules_panel.required_count', { count: String(required.length) })}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The exceptions are the signal — a wall of identical "Active" badges is not. */}
        {inactive.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('modules_panel.not_collected', { count: String(inactive.length) })}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {inactive.map((module) => (
                <Badge
                  key={module.value}
                  title={translateCatalog(t, 'module_description', module.value, module.description)}
                  variant="muted"
                >
                  {translateCatalog(t, 'module', module.value, module.label)}
                  {module.disposition ? ` · ${module.disposition}` : ''}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('modules_panel.all_enabled')}</p>
        )}

        {healthConnect && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            {healthConnect.healthConnectRecordTypes.length > 0 ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('modules_panel.hc_scope', { count: String(healthConnect.healthConnectRecordTypes.length) })}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {healthConnect.healthConnectRecordTypes.map((recordType) => (
                    <Badge key={recordType} variant="outline">
                      {translateCatalog(t, 'health_connect', recordType, healthConnectRecordTypeLabel(recordType))}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-destructive">{t('modules_panel.hc_none')}</p>
            )}
          </div>
        )}

        <details className="group rounded-lg border border-border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/40">
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            {t('modules_panel.all_modules', { count: String(resolved.length) })}
            <span className="ml-auto text-xs font-normal text-muted-foreground">{t('modules_panel.grouped_by')}</span>
          </summary>
          <div className="border-t border-border px-4 pb-3">
            {/* Points at the existing header control rather than duplicating it here. */}
            <p className="pt-3 text-xs text-muted-foreground">
              {t('modules_panel.set_under_before')} <strong>{t('modules_panel.set_under_link')}</strong>
              {t('modules_panel.set_under_after')}
            </p>
            {groups.map(([privacyClass, items]) => (
              <div className="pt-3" key={privacyClass}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {translateCatalog(t, 'privacy_class', privacyClass, privacyClass)}
                </p>
                <ul className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((module) => (
                    <li
                      className="flex items-center justify-between gap-3 border-b border-border/50 py-1 text-sm last:border-0"
                      key={module.value}
                      title={translateCatalog(t, 'module_description', module.value, module.description)}
                    >
                      <span className={cn('truncate', !module.enabled && 'text-muted-foreground')}>
                        {translateCatalog(t, 'module', module.value, module.label)}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs',
                          module.enabled ? 'text-[var(--eq-success)]' : 'text-muted-foreground',
                        )}
                      >
                        {module.enabled
                          ? module.required
                            ? t('common.required')
                            : t('common.active')
                          : t('common.off')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
