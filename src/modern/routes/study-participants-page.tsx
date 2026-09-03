import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  Edit3,
  Info,
  LoaderCircle,
  MoreHorizontal,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Fragment, memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ChangeEnrollmentModal } from '@/components/change-enrollment-modal';
import { DownloadParticipantDataModal } from '@/components/download-participant-data-modal';
import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { ParticipantActivityCell } from '@/components/participant-activity-cell';
import { ParticipantInfoModal } from '@/components/participant-info-modal';
import { ParticipantNotesEditor } from '@/components/participant-notes-editor';
import { QrEnrollmentModal } from '@/components/qr-enrollment-modal';
import { SectionHeader } from '@/components/section-header';
import { nextSort, SortableTableHead, type SortState } from '@/components/sortable-table-head';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { statusLabel, translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDateTime } from '@/lib/format';
import { getStatusVariant } from '@/lib/participant-status';
import { ANDROID_SENSOR_TYPES, SENSOR_MODULE_IDS } from '@/lib/study-constants';
import {
  type AndroidDeviceSensorAvailability,
  type CollectionAcknowledgmentEntry,
  type DataDeletionOperation,
  type IosUploadStatus,
  type Participant,
  type ParticipantStats,
  type StudyDeviceInstance,
  useDeleteStudyParticipantsMutation,
  useGetIosUploadStatusQuery,
  useGetParticipantStatsQuery,
  useGetStudyCollectionAcknowledgmentsQuery,
  useGetStudyDataCollectionSettingQuery,
  useGetStudyDevicesQuery,
  useGetStudyParticipantsQuery,
  useGetStudySensorAvailabilityQuery,
  useGetStudySummaryQuery,
  useLazyGetDeletionOperationQuery,
  useRegisterParticipantMutation,
} from '@/state/study-operations-api';

type ModalState =
  | { type: 'none' }
  | { type: 'qr'; participantId?: string }
  | { type: 'info'; participant: Participant }
  | { type: 'enrollment'; participant: Participant }
  | { type: 'notes'; participant: Participant }
  | { type: 'download'; participantIds: string[] }
  | { type: 'delete-confirm'; participantIds: string[] };

// Stable empty array — avoids creating new references on every render for React.memo
const EMPTY_ARRAY: never[] = [];

type ParticipantSortKey = 'activity' | 'id' | 'status';

/** Never-reported sorts alongside longest-idle rather than being stranded at one end. */
function compareActivity(left: number | null, right: number | null, direction: number) {
  if (left === null && right === null) return 0;
  if (left === null) return -direction;
  if (right === null) return direction;
  return direction * (left - right);
}

/**
 * Individual participant row component, memoized to prevent O(N) re-renders
 * of the entire participant list when a single row's state (expansion/selection) changes.
 */
type ParticipantRowProps = {
  colCount: number;
  handleSingleDelete: (id: string) => void;
  hasTud: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  participant: Participant;
  participantAcknowledgments: CollectionAcknowledgmentEntry[];
  participantDevices: StudyDeviceInstance[];
  participantSensors: AndroidDeviceSensorAvailability[];
  iosUploadStatus?: IosUploadStatus | undefined;
  ps?: ParticipantStats | undefined;
  selectedAndroidSensors: string[];
  hardwareSensorsEnabled: boolean;
  setModal: (state: ModalState) => void;
  toggleExpanded: (id: string) => void;
  toggleSelected: (id: string) => void;
};

type DeviceInstanceTypeSummary = {
  enrollmentCount: number;
  instanceCount: number;
  label: string;
};

type DeviceInstanceSummary = {
  byType: DeviceInstanceTypeSummary[];
  totalEnrollments: number;
  totalInstances: number;
};

function summarizeDeviceInstances(devices: StudyDeviceInstance[], unknownLabel: string): DeviceInstanceSummary {
  const byLabel = new Map<string, DeviceInstanceTypeSummary>();
  let totalEnrollments = 0;

  for (const device of devices) {
    const label = String(device.deviceType ?? unknownLabel);
    const enrollmentCount =
      Array.isArray(device.enrollments) && device.enrollments.length > 0 ? device.enrollments.length : 1;
    const existing = byLabel.get(label) ?? { enrollmentCount: 0, instanceCount: 0, label };
    existing.enrollmentCount += enrollmentCount;
    existing.instanceCount += 1;
    totalEnrollments += enrollmentCount;
    byLabel.set(label, existing);
  }

  return { byType: [...byLabel.values()], totalEnrollments, totalInstances: devices.length };
}

type SensorProfile = { available: string[]; count: number; unavailable: string[] };
type SensorDeviceReport = { available: string[]; sourceDeviceId: string; unavailable: string[] };
type SensorBuckets = {
  available: string[];
  consented: string[];
  notConsented: string[];
  unavailable: string[];
};

const SENSOR_LABELS = new Map<string, string>(
  ANDROID_SENSOR_TYPES.flatMap(({ label, value }) => [
    [value, label],
    [value.toLowerCase(), label],
    [label, label],
  ]),
);

function formatSensorLabel(sensor: string) {
  return (
    SENSOR_LABELS.get(sensor) ??
    sensor
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

// Sensor availability is a pure hardware-capability report (SensorManager
// getDefaultSensor over the full sensor catalog), independent of which sensors
// the study toggled or what the participant consented to. Dedupe identical
// capability profiles and sort each list so re-enrollments of the same hardware
// render as one stable, ordered block instead of repeated, shuffled lists.
function dedupeSensorProfiles(rows: AndroidDeviceSensorAvailability[]): SensorProfile[] {
  const byProfile = new Map<string, SensorProfile>();
  for (const row of rows) {
    const available = [...row.availableSensors].sort((a, b) => a.localeCompare(b));
    const unavailable = [...row.unavailableSensors].sort((a, b) => a.localeCompare(b));
    const signature = `${available.join(',')}|${unavailable.join(',')}`;
    const existing = byProfile.get(signature);
    if (existing) {
      existing.count += 1;
    } else {
      byProfile.set(signature, { available, count: 1, unavailable });
    }
  }
  return [...byProfile.values()];
}

function dedupeSensorReports(rows: AndroidDeviceSensorAvailability[]): SensorDeviceReport[] {
  const bySourceDevice = new Map<string, SensorDeviceReport>();
  for (const row of rows) {
    if (bySourceDevice.has(row.deviceId)) continue;
    bySourceDevice.set(row.deviceId, {
      available: [...row.availableSensors].sort((a, b) => a.localeCompare(b)),
      sourceDeviceId: row.deviceId,
      unavailable: [...row.unavailableSensors].sort((a, b) => a.localeCompare(b)),
    });
  }
  return [...bySourceDevice.values()].sort((a, b) => a.sourceDeviceId.localeCompare(b.sourceDeviceId));
}

function sensorBucketsForReport({
  hardwareAcknowledged,
  hardwareSensorsEnabled,
  report,
  selectedAndroidSensors,
}: {
  hardwareAcknowledged: boolean;
  hardwareSensorsEnabled: boolean;
  report: SensorDeviceReport;
  selectedAndroidSensors: string[];
}): SensorBuckets {
  const selectedSensors = new Set(selectedAndroidSensors);
  const buckets: SensorBuckets = {
    available: [],
    consented: [],
    notConsented: [],
    unavailable: report.unavailable,
  };

  for (const sensor of report.available) {
    if (!hardwareSensorsEnabled || !selectedSensors.has(sensor)) {
      buckets.available.push(sensor);
    } else if (hardwareAcknowledged) {
      buckets.consented.push(sensor);
    } else {
      buckets.notConsented.push(sensor);
    }
  }

  return buckets;
}

function hasHardwareSensorAcknowledgment(
  acknowledgments: CollectionAcknowledgmentEntry[],
  sourceDeviceId: string,
): boolean {
  // Any per-sensor module acknowledged counts as a hardware-sensor acknowledgment (sensors are
  // per-sensor modules now, not one hardware_sensors umbrella).
  return acknowledgments.some(
    (entry) =>
      entry.sourceDeviceId === sourceDeviceId &&
      entry.acknowledgedModules.some((m) => (SENSOR_MODULE_IDS as ReadonlySet<string>).has(m)),
  );
}

function shortDeviceId(sourceDeviceId: string) {
  return sourceDeviceId.length > 12 ? `${sourceDeviceId.slice(0, 8)}...${sourceDeviceId.slice(-4)}` : sourceDeviceId;
}

function formatOptionalDateTime(value?: string | null) {
  return value ? formatDisplayDateTime(value) : '—';
}

function hasIosDevice(devices: StudyDeviceInstance[]) {
  return devices.some((device) =>
    String(device.deviceType ?? '')
      .toLowerCase()
      .includes('ios'),
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function IosUploadStatusPanel({
  participantDevices,
  status,
}: {
  participantDevices: StudyDeviceInstance[];
  status?: IosUploadStatus | undefined;
}) {
  const { t } = useTranslator();
  if (!status && !hasIosDevice(participantDevices)) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('participants.ios_upload_status')}
          </p>
          <p className="text-xs text-muted-foreground">{t('participants.ios_upload_note')}</p>
        </div>
        <Badge variant={status?.lastCommittedAt ? 'success' : 'muted'}>
          {status?.lastCommittedAt ? t('participants.receiving_data') : t('participants.no_committed_ios')}
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatusMetric label={t('participants.committed_rows')} value={(status?.committedRows ?? 0).toLocaleString()} />
        <StatusMetric
          label={t('participants.latest_committed')}
          value={formatOptionalDateTime(status?.lastCommittedAt)}
        />
        <StatusMetric
          label={t('participants.latest_window_end')}
          value={formatOptionalDateTime(status?.lastObservationEndAt)}
        />
        <StatusMetric
          label={t('participants.server_buffer')}
          value={t('participants.server_buffer_value', {
            batches: (status?.bufferedBatches ?? 0).toLocaleString(),
            rows: (status?.bufferedRecords ?? 0).toLocaleString(),
          })}
        />
      </div>
      {status?.lastBufferedUploadAt && (
        <p className="text-xs text-muted-foreground">
          {t('participants.latest_buffered', { time: formatDisplayDateTime(status.lastBufferedUploadAt) })}
        </p>
      )}
    </div>
  );
}

function SensorBucket({
  sensors,
  title,
  variant,
}: {
  sensors: string[];
  title: string;
  variant: 'muted' | 'success' | 'warning';
}) {
  const { t } = useTranslator();
  if (sensors.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {title} ({sensors.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {sensors.map((sensor) => (
          <Badge className="normal-case tracking-normal" key={sensor} variant={variant}>
            {translateCatalog(t, 'android_sensor', sensor, formatSensorLabel(sensor))}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ParticipantExpandedDetails({
  hardwareSensorsEnabled,
  participant,
  participantAcknowledgments,
  participantDevices,
  participantSensors,
  iosUploadStatus,
  selectedAndroidSensors,
}: {
  hardwareSensorsEnabled: boolean;
  participant: Participant;
  participantAcknowledgments: CollectionAcknowledgmentEntry[];
  participantDevices: StudyDeviceInstance[];
  participantSensors: AndroidDeviceSensorAvailability[];
  iosUploadStatus?: IosUploadStatus | undefined;
  selectedAndroidSensors: string[];
}) {
  const { t } = useTranslator();
  const deviceInstances = summarizeDeviceInstances(participantDevices, t('participants.unknown_device_type'));
  const sensorProfiles = dedupeSensorProfiles(participantSensors);
  const sensorReports = dedupeSensorReports(participantSensors);

  return (
    <div className="space-y-3">
      {participant.participantNotes && (
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">{t('participants.notes')}</span>
          {participant.participantNotes}
        </div>
      )}

      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('participants.device_instances', { count: String(deviceInstances.totalInstances) })}
      </div>
      {deviceInstances.totalInstances === 0 ? (
        <p className="text-sm text-muted-foreground">{t('participants.no_device_instances')}</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {t('participants.enrollment_summary', {
              enrollments: String(deviceInstances.totalEnrollments),
              instances: String(deviceInstances.totalInstances),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {deviceInstances.byType.map(({ enrollmentCount, instanceCount, label }) => (
              <Badge key={label} variant="muted">
                {t('participants.instance_badge', { label })}
                {instanceCount > 1 && <span className="ml-1 opacity-70">×{instanceCount}</span>}
                <span className="ml-1 opacity-70">
                  {t('participants.enrollment_count', { count: String(enrollmentCount) })}
                </span>
              </Badge>
            ))}
          </div>
        </>
      )}

      <IosUploadStatusPanel participantDevices={participantDevices} status={iosUploadStatus} />

      {sensorProfiles.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('participants.sensor_matrix')}
          </div>
          <p className="text-xs text-muted-foreground">{t('participants.sensor_matrix_note')}</p>
          {sensorProfiles.some((profile) => profile.count > 1) && (
            <p className="text-xs text-muted-foreground">{t('participants.sensor_matrix_dupes')}</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {sensorReports.map((report) => {
              const acknowledged = hasHardwareSensorAcknowledgment(participantAcknowledgments, report.sourceDeviceId);
              const buckets = sensorBucketsForReport({
                hardwareAcknowledged: acknowledged,
                hardwareSensorsEnabled,
                report,
                selectedAndroidSensors,
              });
              return (
                <div className="space-y-3 rounded-lg border border-border bg-card/70 p-3" key={report.sourceDeviceId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('participants.app_instance')}
                      </p>
                      <p className="font-mono text-xs">{shortDeviceId(report.sourceDeviceId)}</p>
                    </div>
                    <Badge variant={acknowledged ? 'success' : hardwareSensorsEnabled ? 'warning' : 'muted'}>
                      {acknowledged
                        ? t('participants.hw_consented')
                        : hardwareSensorsEnabled
                          ? t('participants.hw_not_consented')
                          : t('participants.hw_not_enabled')}
                    </Badge>
                  </div>
                  <SensorBucket
                    sensors={buckets.consented}
                    title={t('participants.consented_on_device')}
                    variant="success"
                  />
                  <SensorBucket
                    sensors={buckets.notConsented}
                    title={t('participants.not_consented_on_device')}
                    variant="warning"
                  />
                  <SensorBucket
                    sensors={buckets.available}
                    title={t('participants.available_on_device')}
                    variant="muted"
                  />
                  <SensorBucket
                    sensors={buckets.unavailable}
                    title={t('participants.not_available_on_device')}
                    variant="muted"
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ParticipantTagBadges({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="muted">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function ParticipantRowBody({
  colCount,
  handleSingleDelete,
  hardwareSensorsEnabled,
  hasTud,
  isExpanded,
  isSelected,
  participant,
  participantAcknowledgments,
  participantDevices,
  participantSensors,
  iosUploadStatus,
  ps,
  selectedAndroidSensors,
  setModal,
  toggleExpanded,
  toggleSelected,
}: ParticipantRowProps) {
  const { t } = useTranslator();
  return (
    <Fragment>
      <TableRow data-state={isSelected ? 'selected' : undefined}>
        <TableCell>
          <input
            aria-label={t('participants.select_participant', { id: participant.participantId })}
            checked={isSelected}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            onChange={() => toggleSelected(participant.participantId)}
            type="checkbox"
          />
        </TableCell>
        <TableCell className="px-1">
          <button
            aria-expanded={isExpanded}
            aria-label={t(isExpanded ? 'participants.collapse_row' : 'participants.expand_row', {
              id: participant.participantId,
            })}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => toggleExpanded(participant.participantId)}
            type="button"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {participant.participantId}
            <ParticipantTagBadges tags={participant.participantTags} />
          </div>
        </TableCell>
        <TableCell>
          {/* Nearly every participant is ENROLLED, so badging all of them carries no
              information. Render the expected state quietly and let the exceptions
              (withdrawn, paused, …) keep the badge treatment. */}
          {participant.participationStatus === 'ENROLLED' ? (
            <span className="text-xs text-muted-foreground">{t('participants.enrolled')}</span>
          ) : (
            <Badge variant={getStatusVariant(participant.participationStatus)}>
              {statusLabel(t, 'participation', participant.participationStatus)}
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <ParticipantActivityCell hasTud={hasTud} ps={ps} />
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label={t('participants.more_actions')} size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setModal({ type: 'info', participant })}>
                <Info className="mr-2 h-4 w-4" />
                {t('participants.info')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setModal({ type: 'notes', participant })}>
                <Edit3 className="mr-2 h-4 w-4" />
                {t('participants.edit_notes_tags')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setModal({ type: 'enrollment', participant })}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('participants.change_enrollment')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setModal({ type: 'download', participantIds: [participant.participantId] })}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('participants.download_data')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => handleSingleDelete(participant.participantId)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {/* Expanded device row */}
      {isExpanded && (
        <TableRow>
          <TableCell className="bg-muted/30 p-4" colSpan={colCount}>
            <ParticipantExpandedDetails
              hardwareSensorsEnabled={hardwareSensorsEnabled}
              participant={participant}
              participantAcknowledgments={participantAcknowledgments}
              participantDevices={participantDevices}
              participantSensors={participantSensors}
              iosUploadStatus={iosUploadStatus}
              selectedAndroidSensors={selectedAndroidSensors}
            />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

export const ParticipantRow = memo(ParticipantRowBody);
ParticipantRow.displayName = 'ParticipantRow';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This route coordinates participant queries, selection, and modal state; row rendering is delegated.
export function StudyParticipantsPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const {
    data: participants = [],
    error: participantsError,
    isError: isParticipantsError,
    isLoading: isParticipantsLoading,
  } = useGetStudyParticipantsQuery(studyId, { skip: !studyId });

  const { data: stats = {}, isLoading: isStatsLoading } = useGetParticipantStatsQuery(studyId, { skip: !studyId });

  const enrolledCount = participants.filter((p) => p.participationStatus === 'ENROLLED').length;

  const [registerParticipant, { isLoading: isRegistering }] = useRegisterParticipantMutation();
  const [deleteParticipants, { isLoading: isDeletingBatch }] = useDeleteStudyParticipantsMutation();

  const [newParticipantId, setNewParticipantId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [sort, setSort] = useState<SortState<ParticipantSortKey>>({ dir: 'asc', key: 'id' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletionOperations, setDeletionOperations] = useState<DataDeletionOperation[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [getDeletionOperation, deletionStatusRequest] = useLazyGetDeletionOperationQuery();

  const hasExpandedRows = expandedRows.size > 0;
  const { data: devices = {} } = useGetStudyDevicesQuery(studyId, { skip: !studyId || !hasExpandedRows });
  const { data: iosUploadStatus = {} } = useGetIosUploadStatusQuery(studyId, { skip: !studyId || !hasExpandedRows });
  const { data: dataCollectionSetting } = useGetStudyDataCollectionSettingQuery(studyId, { skip: !studyId });
  const { data: sensorAvailability = [] } = useGetStudySensorAvailabilityQuery(studyId, {
    skip: !studyId || !hasExpandedRows,
  });
  const { data: acknowledgments = [] } = useGetStudyCollectionAcknowledgmentsQuery(
    { studyId },
    { skip: !studyId || !hasExpandedRows },
  );

  const modules = useMemo(() => (study?.modules ? Object.keys(study.modules) : []), [study?.modules]);
  const hasTud = modules.includes('TIME_USE_DIARY');
  const selectedAndroidSensors = useMemo(
    () => (Array.isArray(study?.settings?.AndroidSensor?.sensors) ? study.settings.AndroidSensor.sensors : []),
    [study?.settings?.AndroidSensor?.sensors],
  );
  // Any per-sensor module enabled in DataCollection (or, legacy, any selected AndroidSensor).
  const hardwareSensorsEnabled =
    [...SENSOR_MODULE_IDS].some((id) => dataCollectionSetting?.modules?.[id]?.enabled) ||
    selectedAndroidSensors.length > 0;

  // Filter participants by search query (deferred to avoid jank on large lists)
  const searchedParticipants = useMemo(() => {
    if (!deferredSearchQuery.trim()) return participants;
    const q = deferredSearchQuery.toLowerCase();
    return participants.filter((p) => {
      if (p.participantId.toLowerCase().includes(q)) return true;
      if (p.participationStatus.toLowerCase().includes(q)) return true;
      if (p.participantNotes?.toLowerCase().includes(q)) return true;
      if (p.participantTags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [participants, deferredSearchQuery]);

  // Sorting by last upload is the point: it floats the devices that stopped reporting to
  // the top, which is what the activity column exists to surface.
  const filteredParticipants = useMemo(() => {
    const direction = sort.dir === 'asc' ? 1 : -1;
    const lastActivity = (participantId: string): number | null => {
      const ps = stats[participantId];
      const times = [ps?.androidLastPing, ps?.iosLastPing, ps?.tudLastDate]
        .map((value) => (value ? new Date(value).getTime() : Number.NaN))
        .filter((value) => !Number.isNaN(value));
      return times.length > 0 ? Math.max(...times) : null;
    };
    return [...searchedParticipants].sort((a, b) => {
      if (sort.key === 'status') {
        return direction * a.participationStatus.localeCompare(b.participationStatus);
      }
      if (sort.key === 'activity') {
        return compareActivity(lastActivity(a.participantId), lastActivity(b.participantId), direction);
      }
      return direction * a.participantId.localeCompare(b.participantId);
    });
  }, [searchedParticipants, sort, stats]);

  const handleSort = useCallback((key: ParticipantSortKey) => {
    setSort((prev) => nextSort(prev, key));
  }, []);

  // Stable reference for setModal — useCallback prevents React.memo invalidation on ParticipantRow
  const stableSetModal = useCallback((state: ModalState) => setModal(state), []);

  const handleSingleDelete = useCallback(
    (participantId: string) => {
      stableSetModal({ type: 'delete-confirm', participantIds: [participantId] });
    },
    [stableSetModal],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sensorAvailabilityMap = useMemo(() => {
    const map: Record<string, (typeof sensorAvailability)[number][]> = {};
    for (const entry of sensorAvailability) {
      const list = map[entry.participantId] ?? [];
      list.push(entry);
      map[entry.participantId] = list;
    }
    return map;
  }, [sensorAvailability]);

  const acknowledgmentsMap = useMemo(() => {
    const map: Record<string, CollectionAcknowledgmentEntry[]> = {};
    for (const entry of acknowledgments) {
      const list = map[entry.participantId] ?? [];
      list.push(entry);
      map[entry.participantId] = list;
    }
    return map;
  }, [acknowledgments]);

  if (!studyId) {
    return <MissingStudyIdPanel section={t('participants.section')} />;
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipantId.trim()) return;
    setActionError(null);
    try {
      const registered = newParticipantId.trim();
      await registerParticipant({ participantId: registered, studyId }).unwrap();
      setNewParticipantId('');
      // Registering is only half of enrollment — the device still has to scan a code.
      // Hand the researcher that code for the ID they just typed instead of making them
      // reopen the QR dialog and type it a second time.
      setModal({ type: 'qr', participantId: registered });
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, t('participants.register_failed')));
    }
  };

  const handleBulkDelete = async () => {
    if (modal.type !== 'delete-confirm') return;
    const requested = modal.participantIds;
    setActionError(null);
    try {
      const operationIds = await deleteParticipants({ participantIds: requested, studyId }).unwrap();
      setSelectedIds(new Set());
      setModal({ type: 'none' });
      const operations = await Promise.all(
        operationIds.map((operationId) => getDeletionOperation({ operationId, studyId }, false).unwrap()),
      );
      setDeletionOperations(operations);
      if (operationIds.length < requested.length) {
        setActionError(
          t('participants.queued_partial', {
            queued: String(operationIds.length),
            requested: String(requested.length),
          }),
        );
      }
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, t('participants.delete_failed')));
    }
  };

  const refreshDeletionOperations = async () => {
    setActionError(null);
    try {
      const operations = await Promise.all(
        deletionOperations.map(({ operationId }) => getDeletionOperation({ operationId, studyId }, false).unwrap()),
      );
      setDeletionOperations(operations);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, t('participants.refresh_deletion_failed')));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredParticipants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredParticipants.map((p) => p.participantId)));
    }
  };

  const isLoading = isParticipantsLoading || isStatsLoading;

  // checkbox + expand + ID + status + android(3) + ios(3) + actions = 11; + TUD(3) if present
  // select · expand · id · status · activity · actions — the per-platform date columns
  // now collapse into the single activity cell, so this no longer varies with TUD.
  const colCount = 6;

  return (
    <div className="space-y-6">
      {/* No "Open bulk downloads" action here — the Bulk Downloads tab directly above
          navigates to the same route. */}
      <SectionHeader
        size="compact"
        description={t('participants.header_description', {
          enrolled: String(enrolledCount),
          registered: String(participants.length),
        })}
        eyebrow={t('participants.section')}
        icon={<Users className="h-3.5 w-3.5" />}
        title={t('participants.section')}
      />

      {actionError && (
        <StatePanel
          className="max-w-none"
          description={actionError}
          eyebrow={t('common.error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('common.operation_failed')}
          tone="destructive"
        />
      )}

      {deletionOperations.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{t('participants.deletion_status')}</p>
              <p className="text-sm text-muted-foreground">{t('participants.deletion_status_note')}</p>
            </div>
            <Button
              disabled={deletionStatusRequest.isFetching}
              onClick={() => {
                refreshDeletionOperations().catch((err) => {
                  setActionError(getErrorMessage(err, t('participants.refresh_deletion_failed')));
                });
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${deletionStatusRequest.isFetching ? 'animate-spin' : ''}`} />
              {t('participants.refresh_status')}
            </Button>
          </div>
          <div className="space-y-2">
            {deletionOperations.map((operation) => (
              <div className="flex flex-wrap items-center gap-2 text-sm" key={operation.operationId}>
                <code className="text-xs">{operation.operationId}</code>
                <Badge variant={operation.status === 'COMPLETED' ? 'success' : 'warning'}>
                  {statusLabel(t, 'job', operation.status)}
                </Badge>
                {operation.quarantineUntil && (
                  <span className="text-muted-foreground">
                    {t('participants.eligible_after', { time: formatDisplayDateTime(operation.quarantineUntil) })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* One toolbar: filter the list on the left, add to it on the right. The register
          controls previously sat in a Card whose padding made a 40px control row ~130px
          tall, with search stranded in a separate band below it. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('participants.search_aria')}
            className="pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('participants.search_placeholder')}
            value={searchQuery}
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              handleRegister(event).catch((err) => {
                setActionError(getErrorMessage(err, t('participants.register_failed')));
              });
            }}
          >
            <Input
              aria-label={t('participants.new_id_aria')}
              className="sm:w-56"
              onChange={(e) => setNewParticipantId(e.target.value)}
              placeholder={t('participants.new_id_placeholder')}
              value={newParticipantId}
            />
            <Button disabled={isRegistering || !newParticipantId.trim()} type="submit">
              {isRegistering ? (
                <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-1.5 h-4 w-4" />
              )}
              {t('participants.register')}
            </Button>
          </form>
          <Button onClick={() => setModal({ type: 'qr' })} type="button" variant="outline">
            <QrCode className="mr-1.5 h-4 w-4" />
            {t('participants.qr_enrollment')}
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">
            {t('participants.selected_count', { count: String(selectedIds.size) })}
          </span>
          <div className="flex-1" />
          <Button
            onClick={() => setModal({ type: 'download', participantIds: [...selectedIds] })}
            size="sm"
            variant="outline"
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t('participants.download_data_count', { count: String(selectedIds.size) })}
          </Button>
          <Button
            onClick={() => setModal({ type: 'delete-confirm', participantIds: [...selectedIds] })}
            size="sm"
            variant="destructive"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {t('participants.delete_selected_count', { count: String(selectedIds.size) })}
          </Button>
        </div>
      )}

      {isLoading ? (
        <StatePanel
          className="max-w-none"
          description={t('participants.loading_description')}
          eyebrow={t('common.loading')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('participants.loading_title')}
        />
      ) : isParticipantsError ? (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(participantsError, t('participants.load_error_fallback'))}
          eyebrow={t('common.error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('participants.load_error_title')}
          tone="destructive"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    aria-label={t('participants.select_all')}
                    checked={filteredParticipants.length > 0 && selectedIds.size === filteredParticipants.length}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    onChange={toggleSelectAll}
                    type="checkbox"
                  />
                </TableHead>
                <TableHead className="w-8">
                  <span className="sr-only">{t('participants.expand_row_header')}</span>
                </TableHead>
                <SortableTableHead onSort={handleSort} sort={sort} sortKey="id">
                  {t('common.participant_id')}
                </SortableTableHead>
                <SortableTableHead onSort={handleSort} sort={sort} sortKey="status">
                  {t('participants.col_status')}
                </SortableTableHead>
                <SortableTableHead onSort={handleSort} sort={sort} sortKey="activity">
                  {t('participants.col_activity')}
                </SortableTableHead>
                <TableHead className="text-right">{t('participants.col_actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredParticipants.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={colCount}>
                    {searchQuery ? t('participants.no_match') : t('participants.none_found')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredParticipants.map((participant) => (
                  <ParticipantRow
                    colCount={colCount}
                    handleSingleDelete={handleSingleDelete}
                    hardwareSensorsEnabled={hardwareSensorsEnabled}
                    hasTud={hasTud}
                    isExpanded={expandedRows.has(participant.participantId)}
                    isSelected={selectedIds.has(participant.participantId)}
                    key={participant.participantId}
                    participant={participant}
                    participantAcknowledgments={acknowledgmentsMap[participant.participantId] ?? EMPTY_ARRAY}
                    participantDevices={devices[participant.participantId] ?? EMPTY_ARRAY}
                    participantSensors={sensorAvailabilityMap[participant.participantId] ?? EMPTY_ARRAY}
                    iosUploadStatus={iosUploadStatus[participant.participantId]}
                    ps={stats[participant.participantId]}
                    selectedAndroidSensors={selectedAndroidSensors}
                    setModal={stableSetModal}
                    toggleExpanded={toggleExpanded}
                    toggleSelected={toggleSelected}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Modals */}
      {modal.type === 'qr' && (
        <QrEnrollmentModal
          onClose={() => setModal({ type: 'none' })}
          participantId={modal.participantId}
          studyId={studyId}
        />
      )}

      {modal.type === 'info' && (
        <ParticipantInfoModal
          modules={modules}
          onClose={() => setModal({ type: 'none' })}
          participant={modal.participant}
          studyId={studyId}
        />
      )}

      {modal.type === 'enrollment' && (
        <ChangeEnrollmentModal
          onClose={() => setModal({ type: 'none' })}
          participant={modal.participant}
          studyId={studyId}
        />
      )}

      {modal.type === 'notes' && (
        <ParticipantNotesEditor
          onClose={() => setModal({ type: 'none' })}
          participant={modal.participant}
          studyId={studyId}
        />
      )}

      {modal.type === 'download' && (
        <DownloadParticipantDataModal
          modules={modules}
          onClose={() => setModal({ type: 'none' })}
          participantIds={modal.participantIds}
          studyId={studyId}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setModal({ type: 'none' });
        }}
        open={modal.type === 'delete-confirm'}
      >
        <DialogContent className="w-[min(92vw,28rem)]">
          <DialogTitle className="text-destructive">
            {modal.type === 'delete-confirm' && modal.participantIds.length > 1
              ? t('participants.delete_title_many')
              : t('participants.delete_title_one')}
          </DialogTitle>
          <DialogDescription>
            {modal.type === 'delete-confirm' && modal.participantIds.length === 1
              ? t('participants.delete_one_description', { id: modal.participantIds[0] ?? '' })
              : modal.type === 'delete-confirm'
                ? t('participants.delete_many_description', { count: String(modal.participantIds.length) })
                : ''}
          </DialogDescription>
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={() => setModal({ type: 'none' })} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={isDeletingBatch}
              onClick={() => {
                handleBulkDelete().catch((err) => {
                  setActionError(getErrorMessage(err, t('participants.delete_failed')));
                });
              }}
              variant="destructive"
            >
              {isDeletingBatch ? t('common.deleting') : t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
