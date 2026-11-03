import { CircleAlert, Library, Plus, Search } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { SectionHeader } from '@/components/section-header';
import { SortableTableHead } from '@/components/sortable-table-head';
import { StatePanel } from '@/components/state-panel';
import type { StudyFormDialogHandle, StudyFormDialogProps } from '@/components/study-form/types';
import { StudyFormDialog } from '@/components/study-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDate } from '@/lib/format';
import { buildStudyParticipantPolicy, EMPTY_PARTICIPANT_POLICY_FORM } from '@/lib/participant-policy';
import type { SortState } from '@/lib/sort';
import {
  buildAppUsageSurveySetting,
  buildDataCollectionSetting,
  buildStudyLimits,
  buildStudyPayload,
  buildStudyUpdatePayload,
  buildTimeUseDiarySetting,
  buildWithdrawalSetting,
  studyLimitsUnchanged,
} from '@/lib/study-form-helpers';
import type { StudyFormData } from '@/lib/study-form-model';
import { studyFeatureLabel } from '@/lib/study-navigation';
import {
  STUDY_SAVE_STEP,
  StudySaveError,
  type StudySaveFailure,
  type StudySaveStep,
  settingWrites,
  writeSettingsInOrder,
} from '@/lib/study-save';
import { SAVED_EDITS_NAVIGATION } from '@/lib/use-confirm-leave';
import { useListSearchParams, useSearchParamValue } from '@/lib/use-list-search-params';
import { useResearcherCreateIntent } from '@/lib/use-researcher-create-intent';
import { isConditionalWriteFailure, requireSettingsRevision } from '@/state/settings-revision';
import { useAppSelector } from '@/state/store';
import {
  type StudySummary,
  useCreateStudyMutation,
  useGetAllStudiesQuery,
  useLazyGetStudySummaryQuery,
  useSetStudyLimitsMutation,
  useUpdateStudyMutation,
  useUpdateStudySettingsMutation,
} from '@/state/study-operations-api';

type StudySortKey = 'contact' | 'title' | 'updated';

function hasValidStudyId(study: StudySummary): study is StudySummary & { id: string } {
  return typeof study.id === 'string' && study.id.length > 0;
}

function StudyTableRow({ study }: { study: StudySummary & { id: string } }) {
  const studyModules = study.modules ? Object.keys(study.modules) : [];
  const { t } = useTranslator();

  return (
    <TableRow>
      <TableCell>
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link className="font-semibold hover:underline" to={`/studies/${study.id}`}>
              {study.title || study.id}
            </Link>
            {study.version && <Badge variant="outline">{study.version}</Badge>}
          </div>
          {/* One line, not a paragraph — descriptions ran several lines and made every
              row a different height, which is what a scannable list can least afford. */}
          <p className="line-clamp-1 max-w-xl text-xs text-muted-foreground" title={study.description ?? undefined}>
            {study.description || t('common.no_description')}
          </p>
          <code translate="no" className="font-mono text-2xs text-muted-foreground">
            {study.id}
          </code>
        </div>
      </TableCell>
      {/* Truncated: the shared study contact is a long address that otherwise wrapped to
          two lines and widened the column past what the study title had. */}
      <TableCell truncate className="max-w-50" title={study.contact ?? undefined}>
        {study.contact || t('common.not_set')}
      </TableCell>
      <TableCell>
        <div className="flex max-w-sm flex-wrap gap-1">
          {studyModules.length === 0 ? (
            <Badge variant="muted">{t('studies.no_modules')}</Badge>
          ) : (
            studyModules.map((moduleId) => (
              <Badge casing="natural" key={moduleId} variant="muted">
                {translateCatalog(t, 'feature', moduleId, studyFeatureLabel(moduleId))}
              </Badge>
            ))
          )}
        </div>
      </TableCell>
      <TableCell size="small" className="whitespace-nowrap">
        {study.updatedAt ? formatDisplayDate(study.updatedAt) : t('common.na')}
      </TableCell>
    </TableRow>
  );
}

/** The settings and limits a create writes after the study exists; the create itself already carried its modules. */
function createdStudyWrites(form: StudyFormData, retry: boolean) {
  const limits = studyLimitsUnchanged(form) ? null : buildStudyLimits(form);
  return [
    ...settingWrites({
      AppUsageSurvey: buildAppUsageSurveySetting(form),
      DataCollection: retry ? buildDataCollectionSetting(form) : null,
      Withdrawal: buildWithdrawalSetting(form),
      TimeUseDiary: buildTimeUseDiarySetting(form),
      ParticipantPolicy: buildStudyParticipantPolicy(form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM),
    }),
    ...(limits ? [{ settingType: 'limits' as const, limits }] : []),
  ];
}

/** `rememberCreatedStudy` keeps a created study's id until its create completes, then clears it (undefined). */
function useStudyCreate(rememberCreatedStudy: (studyId: string | undefined) => void): StudyFormDialogProps['onSubmit'] {
  const { t } = useTranslator();
  const [updateStudy] = useUpdateStudyMutation();
  const [createStudy] = useCreateStudyMutation();
  const createIntent = useResearcherCreateIntent('/study');
  const [updateStudySettings] = useUpdateStudySettingsMutation();
  const [setStudyLimits] = useSetStudyLimitsMutation();
  const [readStudy] = useLazyGetStudySummaryQuery();
  const navigate = useNavigate();

  return async (form, context) => {
    const study = buildStudyPayload(form);
    const retry = context.createdStudyId !== undefined;
    if (!context.createdStudyId) {
      const intent = await createIntent.currentIntent(study);
      context.createdStudyId = await createStudy({ study, idempotencyKey: intent.key }).unwrap();
      rememberCreatedStudy(context.createdStudyId);
      await createIntent.acknowledge(intent);
    }
    const studyId = context.createdStudyId;

    const writes = createdStudyWrites(form, retry);
    const pendingSteps: StudySaveStep[] = writes.map(({ settingType }) => settingType);
    let failures: StudySaveFailure[];
    if (retry) pendingSteps.unshift(STUDY_SAVE_STEP.details);
    try {
      // No write happens without a revision, so one never captured (a failed read) is read now.
      context.settingsRevision ??= (await readStudy(studyId).unwrap()).settingsRevision;
      // A retry continues from this tab's last committed revision, so another tab's newer save is a
      // conflict that keeps both, never overwritten by this draft.
      if (retry) {
        const updated = await updateStudy({
          studyId,
          study: buildStudyUpdatePayload(form),
          ifMatch: requireSettingsRevision(context.settingsRevision),
        }).unwrap();
        context.settingsRevision = updated.settingsRevision;
        pendingSteps.shift();
      }
      const result = await writeSettingsInOrder(
        writes,
        async (write) => {
          const ifMatch = requireSettingsRevision(context.settingsRevision);
          const saved = await ('limits' in write
            ? setStudyLimits({ studyId, limits: write.limits, ifMatch })
            : updateStudySettings({ studyId, ...write, ifMatch })
          ).unwrap();
          context.settingsRevision = saved.settingsRevision;
        },
        isConditionalWriteFailure,
      );
      failures = result.failures;
    } catch (error) {
      failures = pendingSteps.map((step) => ({ step, error }));
    }

    if (failures.length) throw new StudySaveError({ failures, t });
    // Complete: the next "Create new study" here, even after going back to this page, starts a new study.
    rememberCreatedStudy(undefined);
    await navigate(`/studies/${studyId}`, { state: SAVED_EDITS_NAVIGATION });
    delete context.createdStudyId;
  };
}

function useStudyCatalog(studies: StudySummary[]) {
  const { searchQuery, setSearchQuery, sort, handleSort } = useListSearchParams(
    ['contact', 'title', 'updated'],
    'title',
  );

  const filteredStudies = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const direction = sort.dir === 'asc' ? 1 : -1;
    const field = (study: StudySummary & { id: string }) => {
      if (sort.key === 'contact') return study.contact ?? '';
      if (sort.key === 'updated') return study.updatedAt ?? '';
      return study.title || study.id;
    };
    return studies
      .filter(hasValidStudyId)
      .filter((study) => study.title?.toLowerCase().includes(query) || study.id.toLowerCase().includes(query))
      .sort((a, b) => direction * field(a).localeCompare(field(b)));
  }, [studies, searchQuery, sort]);

  return { filteredStudies, searchQuery, setSearchQuery, sort, handleSort };
}

function StudyCatalogTable({
  studies,
  sort,
  onSort,
}: {
  studies: (StudySummary & { id: string })[];
  sort: SortState<StudySortKey>;
  onSort: (key: StudySortKey) => void;
}) {
  const { t } = useTranslator();
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead onSort={onSort} sort={sort} sortKey="title">
              {t('studies.col_study')}
            </SortableTableHead>
            <SortableTableHead onSort={onSort} sort={sort} sortKey="contact">
              {t('studies.col_contact')}
            </SortableTableHead>
            <TableHead>{t('studies.col_modules')}</TableHead>
            <SortableTableHead onSort={onSort} sort={sort} sortKey="updated">
              {t('studies.col_updated')}
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {studies.map((study) => (
            <StudyTableRow key={study.id} study={study} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function StudySignInPanel({
  testingLoginEnabled,
  providerLabel,
  loginUrl,
}: {
  testingLoginEnabled: boolean;
  providerLabel: string;
  loginUrl: string | null;
}) {
  const { t } = useTranslator();
  return (
    <StatePanel
      className="max-w-none"
      description={
        testingLoginEnabled
          ? t('studies.testing_auth_description')
          : t('studies.sign_in_description', { provider: providerLabel })
      }
      eyebrow={t('studies.auth_eyebrow')}
      icon={<CircleAlert className="h-5 w-5" />}
      title={t('studies.sign_in_required')}
      tone="default"
      actions={
        loginUrl ? (
          <Button asChild size="sm">
            <a href={loginUrl}>{t('studies.continue_with_auth')}</a>
          </Button>
        ) : null
      }
    />
  );
}

function StudyCatalogContent({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  emptyCatalogAction,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => unknown;
  isEmpty: boolean;
  emptyCatalogAction: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslator();
  if (isLoading)
    return (
      <div role="status" aria-label={t('common.loading')} className="grid gap-3">
        {[1, 2, 3].map((i) => (
          <Card variant="loading" key={i}>
            <div className="h-20 bg-muted" />
          </Card>
        ))}
      </div>
    );
  if (isError)
    return (
      <StatePanel
        className="max-w-none"
        description={getErrorMessage(error, t('common.unable_to_load_studies'))}
        eyebrow={t('common.error')}
        icon={<CircleAlert className="h-5 w-5" />}
        onRetry={onRetry}
        title={t('common.failed_to_load_studies')}
        tone="destructive"
      />
    );
  if (isEmpty)
    return (
      <StatePanel
        actions={emptyCatalogAction}
        className="max-w-none"
        description={t('studies.no_results_description')}
        eyebrow={t('studies.no_results_eyebrow')}
        icon={<Library className="h-5 w-5" />}
        title={t('common.no_studies_found')}
      />
    );
  return children;
}

export function StudiesPage() {
  const { t } = useTranslator();
  const [recoveredStudyId, setRecoveredStudyId] = useSearchParamValue<string>('createdStudy', '');
  // The live identity updates before another submit; the URL restores it after leaving this page.
  const [createdStudyId, setCreatedStudyId] = useState(() => recoveredStudyId || undefined);
  const session = useAppSelector((state) => state.session);
  const {
    data: studies = [],
    error,
    isError,
    isLoading,
    refetch: refetchStudies,
  } = useGetAllStudiesQuery(undefined, {
    skip: session.status !== 'authenticated',
  });
  const { filteredStudies, searchQuery, setSearchQuery, sort, handleSort } = useStudyCatalog(studies);
  const rememberCreatedStudy = (id: string | undefined) => {
    setCreatedStudyId(id);
    setRecoveredStudyId(id ?? '');
  };
  const handleCreateStudy = useStudyCreate(rememberCreatedStudy);
  const createDialog = useRef<StudyFormDialogHandle>(null);
  // The empty catalog opens the header's dialog; a second dialog would hold a second, divergent draft.
  const emptyCatalogAction = searchQuery.trim() === '' && (
    <Button aria-haspopup="dialog" onClick={() => createDialog.current?.open()}>
      <Plus className="mr-2 h-4 w-4" />
      {t('study_form.create_new')}
    </Button>
  );
  return (
    <div className="space-y-6">
      <SectionHeader
        actions={
          <StudyFormDialog
            ref={createDialog}
            mode="create"
            onSubmit={handleCreateStudy}
            createdStudyId={createdStudyId}
          />
        }
        description={t('studies.description')}
        eyebrow={t('studies.eyebrow')}
        icon={<Library className="h-3.5 w-3.5" />}
        title={t('studies.title')}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('studies.search_aria')}
          type="search"
          name="study-search"
          autoComplete="off"
          variant="search"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('studies.search_placeholder')}
          value={searchQuery}
        />
      </div>
      {session.status !== 'authenticated' ? (
        <StudySignInPanel
          testingLoginEnabled={session.testingLoginEnabled}
          providerLabel={session.providerLabel}
          loginUrl={session.loginUrl}
        />
      ) : (
        <StudyCatalogContent
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={refetchStudies}
          isEmpty={filteredStudies.length === 0}
          emptyCatalogAction={emptyCatalogAction}
        >
          <StudyCatalogTable studies={filteredStudies} sort={sort} onSort={handleSort} />
        </StudyCatalogContent>
      )}
    </div>
  );
}
