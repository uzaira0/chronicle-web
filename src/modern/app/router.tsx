import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, createRoutesFromElements, Outlet, Route, RouterProvider } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { ParticipantAccessBootstrap } from '@/app/participant-access-bootstrap';
import { ParticipantShell } from '@/app/participant-shell';
import { RouteDocumentTitle } from '@/app/route-document-title';
import { SessionBootstrap, StandaloneLoginPage } from '@/app/session-bootstrap';
import { ObservabilityErrorBoundary } from '@/components/error-boundary';
import { RouteSkeleton } from '@/components/state-panel';
import { BROWSER_DOWNLOAD_REAUTHENTICATION_PATH } from '@/generated/chronicle-contracts';
import { PARTICIPANT_ROUTE_PATHS, pickModernBase } from '@/lib/route-links';
import { UnsavedEditsGuard } from '@/lib/use-confirm-leave';

// Lazy-loaded route pages for code splitting
const NotFoundPage = lazy(() => import('@/routes/not-found-page').then((m) => ({ default: m.NotFoundPage })));
const OverviewPage = lazy(() => import('@/routes/overview-page').then((m) => ({ default: m.OverviewPage })));
const ParticipantDashboardPage = lazy(() =>
  import('@/routes/participant-dashboard-page').then((m) => ({ default: m.ParticipantDashboardPage })),
);
const QuestionnaireRoutePage = lazy(() =>
  import('@/routes/questionnaire-page').then((m) => ({ default: m.QuestionnaireRoutePage })),
);
const SurveyRoutePage = lazy(() => import('@/routes/survey-page').then((m) => ({ default: m.SurveyRoutePage })));
const StudiesPage = lazy(() => import('@/routes/studies-page').then((m) => ({ default: m.StudiesPage })));
const StudyLayout = lazy(() => import('@/routes/study-layout').then((m) => ({ default: m.StudyLayout })));
const StudyDetailsPage = lazy(() =>
  import('@/routes/study-details-page').then((m) => ({ default: m.StudyDetailsPage })),
);
const StudyCompliancePage = lazy(() =>
  import('@/routes/study-compliance-page').then((m) => ({ default: m.StudyCompliancePage })),
);
const StudyBulkDownloadsPage = lazy(() =>
  import('@/routes/study-bulk-downloads-page').then((m) => ({ default: m.StudyBulkDownloadsPage })),
);
const StudyParticipantsPage = lazy(() =>
  import('@/routes/study-participants-page').then((m) => ({ default: m.StudyParticipantsPage })),
);
const StudyQuestionnairesPage = lazy(() =>
  import('@/routes/study-questionnaires-page').then((m) => ({ default: m.StudyQuestionnairesPage })),
);
const StudySettingsAuditPage = lazy(() =>
  import('@/routes/study-settings-audit-page').then((m) => ({ default: m.StudySettingsAuditPage })),
);
const StudyTimeUseDiaryPage = lazy(() =>
  import('@/routes/study-time-use-diary-page').then((m) => ({ default: m.StudyTimeUseDiaryPage })),
);
const TimeUseDiaryPage = lazy(() =>
  import('@/routes/time-use-diary-page').then((m) => ({ default: m.TimeUseDiaryPage })),
);

function RouterRoot() {
  return (
    <>
      <RouteDocumentTitle />
      <UnsavedEditsGuard />
      {/* Inside the data router, the app's boundary must sit below its root to see route errors. */}
      <ObservabilityErrorBoundary>
        <Suspense fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </ObservabilityErrorBoundary>
    </>
  );
}

/** The route table; tests read it through test/route-fixtures.ts. */
export const modernRouteElements = (
  <Route element={<RouterRoot />}>
    <Route
      element={
        <ParticipantAccessBootstrap>
          <ParticipantShell />
        </ParticipantAccessBootstrap>
      }
    >
      <Route element={<QuestionnaireRoutePage />} path={PARTICIPANT_ROUTE_PATHS.QUESTIONNAIRE} />
      <Route element={<SurveyRoutePage />} path={PARTICIPANT_ROUTE_PATHS.APP_USAGE} />
      <Route element={<TimeUseDiaryPage />} path={PARTICIPANT_ROUTE_PATHS.TIME_USE_DIARY} />
      <Route element={<ParticipantDashboardPage />} path={PARTICIPANT_ROUTE_PATHS.PORTAL} />
    </Route>

    {/* Deliberately outside <SessionBootstrap>: the login page must be reachable with
        no session, and gating it behind the bootstrap loader would make it recurse. */}
    <Route element={<StandaloneLoginPage />} path={BROWSER_DOWNLOAD_REAUTHENTICATION_PATH} />

    <Route
      element={
        <SessionBootstrap>
          <AppShell />
        </SessionBootstrap>
      }
      path="/"
    >
      <Route element={<OverviewPage />} index />
      <Route element={<OverviewPage />} path="dashboard" />
      <Route element={<StudiesPage />} path="studies" />

      {/* Study sub-routes wrapped in StudyLayout (tab navigation + actions) */}
      <Route element={<StudyLayout />} path="studies/:studyId">
        <Route element={<StudyDetailsPage />} index />
        <Route element={<StudyParticipantsPage />} path="participants" />
        <Route element={<StudyBulkDownloadsPage />} path="downloads" />
        <Route element={<StudyQuestionnairesPage />} path="questionnaires" />
        <Route element={<StudyCompliancePage />} path="compliance" />
        <Route element={<StudyTimeUseDiaryPage />} path="time-use-diary" />
        <Route element={<StudySettingsAuditPage />} path="settings-audit" />
      </Route>

      <Route element={<NotFoundPage />} path="*" />
    </Route>
  </Route>
);

export function ModernRouter() {
  const [router] = useState(() =>
    createBrowserRouter(createRoutesFromElements(modernRouteElements), { basename: pickModernBase() || '/' }),
  );
  return <RouterProvider router={router} />;
}
