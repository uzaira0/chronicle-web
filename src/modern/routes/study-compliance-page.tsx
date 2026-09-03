import { CircleAlert, LoaderCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useParams } from 'react-router';

import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { useGetComplianceViolationsQuery, useGetStudySummaryQuery } from '@/state/study-operations-api';

function getViolationVariant(reason: string) {
  switch (reason) {
    case 'NO_DATA_UPLOADED':
      return 'destructive';
    case 'NO_RECENT_DATA_UPLOADED':
      return 'warning';
    case 'NOT_ENROLLED':
      return 'outline';
    default:
      return 'muted';
  }
}

const REASON_KEYS: Record<string, string> = {
  NO_DATA_UPLOADED: 'compliance.reason_no_data',
  NO_RECENT_DATA_UPLOADED: 'compliance.reason_no_recent',
  NOT_ENROLLED: 'compliance.reason_not_enrolled',
};

type FlatViolation = { description?: string; participantId: string; reason: string };

function flattenComplianceViolations(studyId: string, complianceMap: unknown): FlatViolation[] {
  if (!studyId || !complianceMap || typeof complianceMap !== 'object') return [];

  const result: FlatViolation[] = [];
  for (const [participantId, pViolations] of Object.entries(complianceMap)) {
    if (!Array.isArray(pViolations)) continue;
    for (const violation of pViolations) {
      if (violation && typeof violation === 'object' && 'reason' in violation) {
        result.push({ ...violation, participantId } as FlatViolation);
      }
    }
  }
  return result;
}

function violationKey(violation: FlatViolation): string {
  return [violation.participantId, violation.reason, violation.description ?? ''].join(':');
}

export function StudyCompliancePage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const {
    data: complianceMap = {},
    error,
    isError,
    isLoading,
    refetch,
    isFetching,
  } = useGetComplianceViolationsQuery(studyId, { skip: !studyId });

  const violations = useMemo(() => flattenComplianceViolations(studyId, complianceMap), [complianceMap, studyId]);

  if (!studyId) {
    return <MissingStudyIdPanel section={t('compliance.section')} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        size="compact"
        actions={
          <Button
            disabled={isFetching}
            onClick={() => {
              refetch()
                .unwrap()
                .catch(() => {
                  // The query hook owns and renders refresh failures.
                });
            }}
            variant="outline"
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        }
        description={t('compliance.description')}
        eyebrow={t('compliance.eyebrow')}
        icon={<ShieldAlert className="h-3.5 w-3.5" />}
        title={t('compliance.title', { name: study?.title || studyId })}
      />

      {isLoading ? (
        <StatePanel
          className="max-w-none"
          description={t('compliance.loading_description')}
          eyebrow={t('common.loading')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('compliance.loading_title')}
        />
      ) : isError ? (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(error, t('compliance.load_error_fallback'))}
          eyebrow={t('common.error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('compliance.load_error_title')}
          tone="destructive"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.participant_id')}</TableHead>
                <TableHead>{t('compliance.col_reason')}</TableHead>
                <TableHead>{t('common.description')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {violations.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={3}>
                    {t('compliance.none')}
                  </TableCell>
                </TableRow>
              ) : (
                violations.map((violation) => (
                  <TableRow key={violationKey(violation)}>
                    <TableCell className="font-medium">{violation.participantId}</TableCell>
                    <TableCell>
                      <Badge variant={getViolationVariant(violation.reason)}>
                        {REASON_KEYS[violation.reason]
                          ? t(REASON_KEYS[violation.reason] ?? '')
                          : violation.reason.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-muted-foreground">{violation.description}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
