import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ProtectedLayout } from '@/app/ProtectedLayout'
import LoginPage from '@/pages/auth/LoginPage'
import SignupPage from '@/pages/auth/SignupPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import UpdatePasswordPage from '@/pages/auth/UpdatePasswordPage'
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage'
import InviteAcceptancePage from '@/pages/InviteAcceptancePage'
import JoinPage from '@/pages/JoinPage'
const GlobalRatingPage = lazy(() => import('@/pages/account/GlobalRatingPage'))
const SubscriptionPage = lazy(() => import('@/pages/account/SubscriptionPage'))
const LegalPrivacyPage = lazy(() => import('@/pages/account/LegalPrivacyPage'))
const LeaguesPage = lazy(() => import('@/pages/account/LeaguesPage'))
const LeaguePlusPage = lazy(() => import('@/pages/admin/LeaguePlusPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const AccountPage = lazy(() => import('@/pages/AccountPage'))
const ChampionshipsPage = lazy(() => import('@/pages/championships/ChampionshipsPage'))
const ChampionshipDetailPage = lazy(() => import('@/pages/championships/ChampionshipDetailPage'))
const SeasonDetailPage = lazy(() => import('@/pages/championships/SeasonDetailPage'))
const SeasonTeamsPage = lazy(() => import('@/pages/championships/SeasonTeamsPage'))
const SchedulePage = lazy(() => import('@/pages/championships/SchedulePage'))
const TeamsRedirect = lazy(() => import('@/pages/championships/SchedulePage').then((m) => ({ default: m.TeamsRedirect })))
const DriversPage = lazy(() => import('@/pages/drivers/DriversPage'))
const DriverProfilePage = lazy(() => import('@/pages/drivers/DriverProfilePage'))
const MyDriverPage = lazy(() => import('@/pages/drivers/MyDriverPage'))
const TracksPage = lazy(() => import('@/pages/catalog/TracksPage'))
const ClassesPage = lazy(() => import('@/pages/catalog/ClassesPage'))
const RegionsPage = lazy(() => import('@/pages/catalog/RegionsPage'))
const RaceWeekendHubPage = lazy(() => import('@/pages/raceWeekend/RaceWeekendHubPage'))
const RaceWeekendEventPage = lazy(() => import('@/pages/raceWeekend/RaceWeekendEventPage'))
const RacePrepPage = lazy(() => import('@/pages/raceWeekend/RacePrepPage'))
const QualifyingPage = lazy(() => import('@/pages/raceWeekend/QualifyingPage'))
const ResultsPage = lazy(() => import('@/pages/raceWeekend/ResultsPage'))
const ResultsHubPage = lazy(() => import('@/pages/raceWeekend/ResultsHubPage'))
const PitWallPage = lazy(() => import('@/pages/pitWall/PitWallPage'))
const ResultsAuditLogPage = lazy(() => import('@/pages/raceWeekend/ResultsAuditLogPage'))
const StandingsPage = lazy(() => import('@/pages/standings/StandingsPage'))
const PredictionsPage = lazy(() => import('@/pages/predictions/PredictionsPage'))
const AdminHubPage = lazy(() => import('@/pages/admin/AdminHubPage'))
const MembersPage = lazy(() => import('@/pages/admin/MembersPage'))
const InvitationsPage = lazy(() => import('@/pages/admin/InvitationsPage'))
const AnnouncementsPage = lazy(() => import('@/pages/admin/AnnouncementsPage'))
import { ProGate } from '@/components/ProGate'
import { LoadingState } from '@/components/States'
import LegalSupportPage from '@/pages/LegalSupportPage'

function RootRedirect() {
  const { state, loading } = useAuth()
  if (loading) return null
  return <Navigate to={state.kind === 'authenticated' ? '/dashboard' : '/login'} replace />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Loading…" />}>
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/reset-password/update" element={<UpdatePasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/invite/:token" element={<InviteAcceptancePage />} />
      <Route path="/legal" element={<LegalSupportPage />} />
      <Route path="/eula" element={<Navigate to="/legal#eula" replace />} />
      <Route path="/privacy" element={<Navigate to="/legal#privacy" replace />} />
      <Route path="/terms" element={<Navigate to="/legal#terms" replace />} />
      <Route path="/support" element={<Navigate to="/legal#support" replace />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/global-rating" element={<GlobalRatingPage />} />
        <Route path="/account/subscription" element={<SubscriptionPage />} />
        <Route path="/account/legal" element={<LegalPrivacyPage />} />
        <Route path="/account/leagues" element={<LeaguesPage />} />
        <Route path="/join" element={<JoinPage />} />

        <Route path="/championships" element={<ChampionshipsPage />} />
        <Route path="/championships/:id" element={<ChampionshipDetailPage />} />
        <Route path="/seasons/:id" element={<SeasonDetailPage />} />
        <Route path="/seasons/:id/teams" element={<SeasonTeamsPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/teams" element={<TeamsRedirect />} />

        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/drivers/me" element={<MyDriverPage />} />
        <Route path="/drivers/:id" element={<DriverProfilePage />} />

        <Route path="/tracks" element={<TracksPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/regions" element={<RegionsPage />} />

        <Route path="/race-weekend" element={<RaceWeekendHubPage />} />
        <Route path="/race-weekend/:eventId" element={<RaceWeekendEventPage />} />
        <Route path="/race-prep/:eventId" element={<RacePrepPage />} />
        <Route path="/qualifying/:eventId" element={<QualifyingPage />} />
        <Route path="/results" element={<ResultsHubPage />} />
        <Route path="/results/:eventId" element={<ResultsPage />} />
        <Route path="/results/:eventId/audit" element={<ResultsAuditLogPage />} />

        <Route path="/standings" element={<StandingsPage />} />
        <Route
          path="/pit-wall"
          element={
            <ProGate title="Pit Wall requires VRC Ops Pro" description="Pit Wall is included with VRC Ops Pro and League Plus.">
              <PitWallPage />
            </ProGate>
          }
        />
        {/* Pre-Stage-7 iOS deep-link paths that now mean Pit Wall (never a dead link). */}
        <Route path="/capture" element={<Navigate to="/pit-wall" replace />} />
        <Route path="/telemetry" element={<Navigate to="/pit-wall" replace />} />
        <Route path="/pitwall" element={<Navigate to="/pit-wall" replace />} />
        <Route
          path="/predictions"
          element={
            <ProGate
              title="Predictions require VRC Ops Pro"
              description="Race forecasts, championship outlook, and incident-risk markets are part of VRC Ops Pro."
            >
              <PredictionsPage />
            </ProGate>
          }
        />

        <Route path="/admin/league-plus" element={<LeaguePlusPage />} />
        <Route path="/admin" element={<AdminHubPage />} />
        <Route path="/admin/members" element={<MembersPage />} />
        <Route path="/admin/invitations" element={<InvitationsPage />} />
        <Route path="/admin/announcements" element={<AnnouncementsPage />} />
        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
