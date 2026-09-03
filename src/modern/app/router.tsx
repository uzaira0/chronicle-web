import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { AppShell } from '@/app/app-shell';
import { ParticipantAccessBootstrap } from '@/app/participant-access-bootstrap';
import { ParticipantShell } from '@/app/participant-shell';
import { SessionBootstrap } from '@/app/session-bootstrap';
import { pickModernBase } from '@/lib/route-links';

// Lazy-loaded route pages for code splitting
const LoginPage = lazy(() => import('@/routes/login-page').then((m) => ({ default: m.LoginPage })));
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
const StudyPreprocessingPage = lazy(() =>
  import('@/routes/study-preprocessing-page').then((m) => ({ default: m.StudyPreprocessingPage })),
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

export function ModernRouter() {
  const basename = pickModernBase() || '/';

  return (
    <BrowserRouter basename={basename}>
      <Suspense fallback={null}>
        <Routes>
          <Route
            element={
              <ParticipantAccessBootstrap>
                <ParticipantShell />
              </ParticipantAccessBootstrap>
            }
          >
            <Route element={<QuestionnaireRoutePage />} path="questionnaire" />
            <Route element={<SurveyRoutePage />} path="survey" />
            <Route element={<TimeUseDiaryPage />} path="time-use-diary" />
            <Route element={<ParticipantDashboardPage />} path="participant" />
          </Route>

          {/* Deliberately outside <SessionBootstrap>: the login page must be reachable with
              no session, and gating it behind the bootstrap loader would make it recurse. */}
          <Route element={<LoginPage redirectTo="/" />} path="login" />

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
              <Route element={<StudyPreprocessingPage />} path="preprocessing" />
              <Route element={<StudyBulkDownloadsPage />} path="downloads" />
              <Route element={<StudyQuestionnairesPage />} path="questionnaires" />
              <Route element={<StudyCompliancePage />} path="compliance" />
              <Route element={<StudyTimeUseDiaryPage />} path="time-use-diary" />
              <Route element={<StudySettingsAuditPage />} path="settings-audit" />
              <Route element={<StudySettingsAuditPage />} path="audit" />
            </Route>

            <Route element={<NotFoundPage />} path="*" />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
