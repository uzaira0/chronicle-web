import { Bell, CircleAlert, Library, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { SectionHeader } from '@/components/section-header';
import { nextSort, SortableTableHead, type SortState } from '@/components/sortable-table-head';
import { StatePanel } from '@/components/state-panel';
import { type StudyFormData, StudyFormDialog } from '@/components/study-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDate } from '@/lib/format';
import { buildStudyParticipantPolicy, EMPTY_PARTICIPANT_POLICY_FORM } from '@/lib/participant-policy';
import { STUDY_FEATURES } from '@/lib/study-constants';
import {
  buildDataCollectionSetting,
  buildIosSensorSetting,
  buildSensorSetting,
  buildStudyLimits,
  buildStudyPayload,
} from '@/lib/study-form-helpers';
import { studyConfigurationNavigationState } from '@/lib/study-navigation';
import { useAppSelector } from '@/state/store';
import {
  type StudySummary,
  useCreateStudyMutation,
  useGetAllStudiesQuery,
  useSetStudyLimitsMutation,
  useUpdateStudySettingsMutation,
} from '@/state/study-operations-api';

function hasValidStudyId(study: StudySummary): study is StudySummary & { id: string } {
  return typeof study.id === 'string' && study.id.length > 0;
}

type StudySortKey = 'contact' | 'title' | 'updated';

const FEATURE_LABELS = new Map<string, string>(STUDY_FEATURES.map(({ label, value }) => [value, label]));

function moduleLabel(moduleId: string) {
  return FEATURE_LABELS.get(moduleId) ?? moduleId.replace(/_/g, ' ');
}

function StudyTableRow({ study }: { study: StudySummary & { id: string } }) {
  const studyModules = study.modules ? Object.keys(study.modules) : [];
  const { t } = useTranslator();

  return (
    <TableRow>
      <TableCell>
        {/* The title is the link. The row previously carried a separate "Details →"
            column doing the same navigation. */}
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link className="font-semibold hover:underline" to={`/studies/${study.id}`}>
              {study.title || study.id}
            </Link>
            {study.version && <Badge variant="outline">{study.version}</Badge>}
            {study.notificationsEnabled && (
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                title={t('studies.notifications_enabled')}
              >
                <Bell aria-hidden="true" className="h-3 w-3" />
                {t('studies.notifications')}
              </span>
            )}
          </div>
          {/* One line, not a paragraph — descriptions ran several lines and made every
              row a different height, which is what a scannable list can least afford. */}
          <p className="line-clamp-1 max-w-xl text-xs text-muted-foreground" title={study.description ?? undefined}>
            {study.description || t('common.no_description')}
          </p>
          <code className="font-mono text-[11px] text-muted-foreground">{study.id}</code>
        </div>
      </TableCell>
      {/* Truncated: the shared study contact is a long address that otherwise wrapped to
          two lines and widened the column past what the study title had. */}
      <TableCell className="max-w-[200px] truncate text-sm" title={study.contact ?? undefined}>
        {study.contact || t('common.not_set')}
      </TableCell>
      <TableCell>
        <div className="flex max-w-sm flex-wrap gap-1">
          {studyModules.length === 0 ? (
            <Badge variant="muted">{t('studies.no_modules')}</Badge>
          ) : (
            studyModules.map((moduleId) => (
              <Badge className="normal-case tracking-normal" key={moduleId} variant="muted">
                {translateCatalog(t, 'feature', moduleId, moduleLabel(moduleId))}
              </Badge>
            ))
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {study.updatedAt ? formatDisplayDate(study.updatedAt) : t('common.na')}
      </TableCell>
    </TableRow>
  );
}

export function StudiesPage() {
  const session = useAppSelector((state) => state.session);
  const { t } = useTranslator();
  const {
    data: studies = [],
    error: studiesError,
    isError,
    isLoading: isStudiesLoading,
  } = useGetAllStudiesQuery(undefined, {
    skip: session.status !== 'authenticated',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState<StudySortKey>>({ dir: 'asc', key: 'title' });
  const [createStudy] = useCreateStudyMutation();
  const [updateStudySettings] = useUpdateStudySettingsMutation();
  const [setStudyLimits] = useSetStudyLimitsMutation();
  const navigate = useNavigate();

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

  const handleSort = useCallback((key: StudySortKey) => {
    setSort((prev) => nextSort(prev, key));
  }, []);

  const handleCreateStudy = async (form: StudyFormData) => {
    const studyId = await createStudy(buildStudyPayload(form)).unwrap();

    // Best-effort post-create config (the study already exists). The settings
    // PATCHes each do a read-merge-write of the full settings map, so they must run
    // sequentially — running them in parallel would clobber one another. Limits is a
    // disjoint write and runs in parallel with the settings sequence.
    const sensorSetting = buildSensorSetting(form);
    const iosSensorSetting = buildIosSensorSetting(form);
    const dataCollection = buildDataCollectionSetting(form);
    const participantPolicy = buildStudyParticipantPolicy(form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM);
    const limits = buildStudyLimits(form);
    const writeSettings = async () => {
      await updateStudySettings({
        studyId,
        settingType: 'ParticipantPolicy',
        setting: participantPolicy,
      }).unwrap();
      if (sensorSetting) {
        await updateStudySettings({ studyId, settingType: 'AndroidSensor', setting: sensorSetting }).unwrap();
      }
      if (iosSensorSetting) {
        await updateStudySettings({ studyId, settingType: 'Sensor', setting: iosSensorSetting }).unwrap();
      }
      if (dataCollection) {
        await updateStudySettings({ studyId, settingType: 'DataCollection', setting: dataCollection }).unwrap();
      }
    };
    const configurationResults = await Promise.allSettled([
      writeSettings(),
      limits ? setStudyLimits({ studyId, limits }).unwrap() : null,
    ]);

    await navigate(`/studies/${studyId}`, {
      state: studyConfigurationNavigationState(configurationResults),
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        actions={<StudyFormDialog mode="create" onSubmit={handleCreateStudy} />}
        description={t('studies.description')}
        eyebrow={t('studies.eyebrow')}
        icon={<Library className="h-3.5 w-3.5" />}
        title={t('studies.title')}
      />

      {/* A single input does not need a Card around it — that framed an otherwise empty
          box and matched nothing else in the app. Same bare search as Participants. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('studies.search_aria')}
          className="pl-9"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('studies.search_placeholder')}
          value={searchQuery}
        />
      </div>

      {session.status !== 'authenticated' ? (
        <StatePanel
          className="max-w-none"
          description={
            session.testingLoginEnabled
              ? t('studies.testing_auth_description')
              : t('studies.sign_in_description', { provider: session.providerLabel })
          }
          eyebrow={t('studies.auth_eyebrow')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('studies.sign_in_required')}
          tone="default"
          actions={
            session.loginUrl ? (
              <Button asChild size="sm">
                <a href={session.loginUrl}>{t('studies.continue_with_auth')}</a>
              </Button>
            ) : null
          }
        />
      ) : isStudiesLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card className="animate-pulse" key={i}>
              <div className="h-20 bg-muted" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(studiesError, t('common.unable_to_load_studies'))}
          eyebrow={t('common.error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('common.failed_to_load_studies')}
          tone="destructive"
        />
      ) : filteredStudies.length === 0 ? (
        <StatePanel
          className="max-w-none"
          description={t('studies.no_results_description')}
          eyebrow={t('studies.no_results_eyebrow')}
          icon={<Library className="h-5 w-5" />}
          title={t('common.no_studies_found')}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead onSort={handleSort} sort={sort} sortKey="title">
                  {t('studies.col_study')}
                </SortableTableHead>
                <SortableTableHead onSort={handleSort} sort={sort} sortKey="contact">
                  {t('studies.col_contact')}
                </SortableTableHead>
                <TableHead>{t('studies.col_modules')}</TableHead>
                <SortableTableHead onSort={handleSort} sort={sort} sortKey="updated">
                  {t('studies.col_updated')}
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudies.map((study) => (
                <StudyTableRow key={study.id} study={study} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
