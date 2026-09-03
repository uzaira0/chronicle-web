// Real data for `bun run dev:local`, read straight from the prod DB (READ-ONLY).
//
// The dev server answers the study endpoints with live rows from chronicle-postgres,
// so the whole dashboard shows REAL data — not fixtures. Queries run via
// `docker exec chronicle-postgres psql` (the trusted in-container localhost path, no
// SSL dance). SQL is passed via an env var (DEV_SQL); the only request-derived value
// injected is an id constrained to a UUID by the route regex AND re-validated below —
// so there is no SQL injection surface. Scope is metadata (study fields, participant
// codes, app-device instance ids, ping/collection dates, counts, ack trail) — never raw sensor values.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });

async function q(sql: string): Promise<unknown> {
  const proc = Bun.spawn(
    [
      'docker',
      'exec',
      '-e',
      'DEV_SQL',
      'chronicle-postgres',
      'bash',
      '-lc',
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$DEV_SQL"',
    ],
    { env: { ...process.env, DEV_SQL: sql }, stderr: 'pipe', stdout: 'pipe' },
  );
  const out = (await new Response(proc.stdout).text()).trim();
  const err = (await new Response(proc.stderr).text()).trim();
  await proc.exited;
  if (err) process.stderr.write(`[dev-realdata] ${err}\n`);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const STUDY_OBJECT = `json_build_object(
  'id', study_id, 'title', title, 'description', description, 'group', study_group,
  'contact', contact, 'phoneNumber', study_phone_number,
  'createdAt', created_at, 'updatedAt', updated_at, 'startedAt', started_at,
  'endedAt', case when ended_at = 'infinity' then null else ended_at end,
  'notificationsEnabled', coalesce(notifications_enabled, false),
  'modules', coalesce(modules, '{}'::jsonb), 'settings', coalesce(settings, '{}'::jsonb)
)`;

// id -> Promise<Response>. Each query returns a single JSON value via json_agg /
// json_object_agg / json_build_object so the result maps straight onto the API shape.
const studies = async () =>
  json(
    (await q(
      `select coalesce(json_agg(${STUDY_OBJECT} order by updated_at desc nulls last), '[]'::json) from studies`,
    )) ?? [],
  );

const study = async (id: string) =>
  json((await q(`select ${STUDY_OBJECT} from studies where study_id::text = '${id}'`)) ?? null);

const studySettings = async (id: string) =>
  json((await q(`select coalesce(settings, '{}'::jsonb) from studies where study_id::text = '${id}'`)) ?? {});

const dataCollectionSetting = async (id: string) =>
  json(
    (await q(
      `select coalesce(settings -> 'DataCollection', '{}'::jsonb) from studies where study_id::text = '${id}'`,
    )) ?? {},
  );

const participants = async (id: string) =>
  json(
    (await q(`select coalesce(json_agg(json_build_object(
      'participantId', participant_id, 'participationStatus', participation_status,
      'participantNotes', participant_notes,
      'participantTags', coalesce(to_json(participant_tags), '[]'::json),
      'candidate', case when candidate_id is null then null else json_build_object('candidateId', candidate_id) end
    )), '[]'::json) from study_participants where study_id::text = '${id}'`)) ?? [],
  );

const participantStats = async (id: string) =>
  json(
    (await q(`select coalesce(json_object_agg(participant_id, json_build_object(
      'participantId', participant_id, 'studyId', study_id,
      'androidLastPing', android_last_ping, 'androidFirstDate', android_first_date, 'androidLastDate', android_last_date,
      'androidUniqueDates', coalesce(to_json(android_unique_dates), '[]'::json),
      'iosLastPing', ios_last_ping, 'iosFirstDate', ios_first_date, 'iosLastDate', ios_last_date,
      'iosUniqueDates', coalesce(to_json(ios_unique_dates), '[]'::json),
      'tudFirstDate', tud_first_date, 'tudLastDate', tud_last_date,
      'tudUniqueDates', coalesce(to_json(tud_unique_dates), '[]'::json)
    )), '{}'::json) from participant_stats where study_id::text = '${id}'`)) ?? {},
  );

// StudyDeviceInstancesMap: Record<participantId, StudyDeviceInstance[]>
const devices = async (id: string) => {
  const hasEnrollmentTrail = await q("select to_json(to_regclass('public.device_enrollments') is not null)");
  const enrollmentJoin = hasEnrollmentTrail
    ? `left join device_enrollments e
        on e.study_id = d.study_id
        and e.participant_id = d.participant_id
        and e.device_id = d.device_id`
    : '';
  const enrollments = hasEnrollmentTrail
    ? `coalesce(json_agg(json_build_object(
        'enrollmentId', e.enrollment_id,
        'enrolledAt', e.enrolled_at
      ) order by e.enrolled_at) filter (where e.enrollment_id is not null), '[]'::json)`
    : `json_build_array(json_build_object('enrollmentId', null, 'enrolledAt', null))`;

  return json(
    (await q(`select coalesce(json_object_agg(participant_id, devs), '{}'::json) from (
      select d.participant_id, json_agg(json_build_object(
        'deviceId', d.device_id,
        'deviceType', d.device_type,
        'sourceDevice', coalesce(d.source_device, '{}'::jsonb),
        'enrollments', ${enrollments}
      )) devs
      from devices d
      ${enrollmentJoin}
      where d.study_id::text = '${id}'
      group by d.participant_id, d.device_id, d.device_type, d.source_device
    ) x`)) ?? {},
  );
};

const questionnaires = async (id: string) =>
  json(
    (await q(`select coalesce(json_agg(json_build_object(
      'id', questionnaire_id, 'title', title, 'description', description,
      'questions', coalesce(questions, '[]'::jsonb), 'active', active,
      'recurrenceRule', recurrence_rule, 'dateCreated', created_at
    ) order by created_at desc), '[]'::json) from questionnaires where study_id::text = '${id}'`)) ?? [],
  );

const settingsAudit = async (id: string) =>
  json(
    (await q(`select coalesce(json_agg(json_build_object(
      'id', id, 'studyId', study_id, 'settingKey', setting_key,
      'changedAt', changed_at, 'changedBy', changed_by,
      'beforeValue', before_value, 'afterValue', after_value, 'changeSummary', change_summary
    ) order by changed_at desc), '[]'::json) from study_settings_audit where study_id::text = '${id}'`)) ?? [],
  );

const acknowledgments = async (id: string) =>
  json(
    (await q(`select coalesce(json_agg(json_build_object(
      'id', id, 'studyId', study_id, 'participantId', participant_id, 'sourceDeviceId', source_device_id,
      'acknowledgedModules', coalesce(to_json(acknowledged_modules), '[]'::json),
      'acknowledgedAt', acknowledged_at, 'recordedAt', recorded_at, 'appVersion', app_version
    ) order by recorded_at desc), '[]'::json) from participant_collection_acknowledgment where study_id::text = '${id}'`)) ??
      [],
  );

// StudySubmissionGroups: Record<date, ids[]>
const tudIds = async (id: string) =>
  json(
    (await q(`select coalesce(json_object_agg(d, ids), '{}'::json) from (
      select submission_date::text d, json_agg(submission_id) ids
      from time_use_diary_submissions where study_id::text = '${id}' group by submission_date) x`)) ?? {},
  );

const sensorAvailability = async (id: string) =>
  json(
    (await q(`select coalesce(json_agg(json_build_object(
      'participantId', participant_id, 'sourceDeviceId', coalesce(source_device_id, device_id::text),
      'availableSensors', coalesce(to_json(available_sensors), '[]'::json),
      'unavailableSensors', coalesce(to_json(unavailable_sensors), '[]'::json)
    )), '[]'::json) from android_device_sensor_availability where study_id::text = '${id}'`)) ?? [],
  );

const lifecycle = async (id: string) =>
  json(
    (await q(
      `select json_build_object('status', coalesce(lifecycle_status, 'ACTIVE')) from studies where study_id::text = '${id}'`,
    )) ?? { status: 'ACTIVE' },
  );

// Compliance violations are a backend-computed view, not a table. Empty = "no
// violations", which is a valid real state to render.
const compliance = () => json({});
// Limits live in study_limits with interval/jsonb columns whose exact shape the
// study form tolerates as absent; return {} (no custom limits) rather than mis-shape it.
const limits = () => json({});

const ROUTES: Array<[RegExp, (id: string) => Response | Promise<Response>]> = [
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})$/i, study],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/participants$/i, participants],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/participants\/stats$/i, participantStats],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/devices$/i, devices],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/settings\/audit$/i, settingsAudit],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/settings\/acknowledgments$/i, acknowledgments],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/settings\/type\/DataCollection$/i, dataCollectionSetting],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/settings$/i, studySettings],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/android\/sensors\/availability$/i, sensorAvailability],
  [/^\/chronicle\/v3\/survey\/([0-9a-f-]{36})\/questionnaire$/i, questionnaires],
  [/^\/chronicle\/v3\/time-use-diary\/([0-9a-f-]{36})\/ids$/i, tudIds],
  [/^\/chronicle\/api\/web\/compliance\/study\/([0-9a-f-]{36})$/i, compliance],
  [/^\/chronicle\/v3\/study\/([0-9a-f-]{36})\/lifecycle$/i, lifecycle],
  [/^\/chronicle\/api\/web\/limits\/study\/([0-9a-f-]{36})$/i, limits],
];

// Return a live-data Response for a /chronicle/* path, or null to let the caller
// fall through (auth fixtures / benign default). Only GETs are served from the DB.
export async function realDataResponse(method: string, pathname: string): Promise<Response | null> {
  if (method.toUpperCase() !== 'GET') return null;
  if (pathname === '/chronicle/v3/study') return studies();

  for (const [re, handler] of ROUTES) {
    const m = pathname.match(re);
    const id = m?.[1];
    if (id && UUID.test(id)) return handler(id);
  }
  return null;
}
