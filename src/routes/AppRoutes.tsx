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
import DashboardPage from '@/pages/DashboardPage'
import AccountPage from '@/pages/AccountPage'
import ChampionshipsPage from '@/pages/championships/ChampionshipsPage'
import ChampionshipDetailPage from '@/pages/championships/ChampionshipDetailPage'
import SeasonDetailPage from '@/pages/championships/SeasonDetailPage'
import DriversPage from '@/pages/drivers/DriversPage'
import DriverProfilePage from '@/pages/drivers/DriverProfilePage'
import TracksPage from '@/pages/catalog/TracksPage'
import ClassesPage from '@/pages/catalog/ClassesPage'
import RegionsPage from '@/pages/catalog/RegionsPage'
import RaceWeekendHubPage from '@/pages/raceWeekend/RaceWeekendHubPage'
import RaceWeekendEventPage from '@/pages/raceWeekend/RaceWeekendEventPage'
import RacePrepPage from '@/pages/raceWeekend/RacePrepPage'
import QualifyingPage from '@/pages/raceWeekend/QualifyingPage'
import ResultsPage from '@/pages/raceWeekend/ResultsPage'
import StandingsPage from '@/pages/standings/StandingsPage'
import PredictionsPage from '@/pages/predictions/PredictionsPage'
import AdminPage from '@/pages/admin/AdminPage'

function RootRedirect() {
  const { state, loading } = useAuth()
  if (loading) return null
  return <Navigate to={state.kind === 'authenticated' ? '/dashboard' : '/login'} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/reset-password/update" element={<UpdatePasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/invite/:token" element={<InviteAcceptancePage />} />
      <Route path="/join" element={<JoinPage />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/account" element={<AccountPage />} />

        <Route path="/championships" element={<ChampionshipsPage />} />
        <Route path="/championships/:id" element={<ChampionshipDetailPage />} />
        <Route path="/seasons/:id" element={<SeasonDetailPage />} />

        <Route path="/drivers" element={<DriversPage />} />
        <Route path="/drivers/:id" element={<DriverProfilePage />} />

        <Route path="/tracks" element={<TracksPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/regions" element={<RegionsPage />} />

        <Route path="/race-weekend" element={<RaceWeekendHubPage />} />
        <Route path="/race-weekend/:eventId" element={<RaceWeekendEventPage />} />
        <Route path="/race-prep/:eventId" element={<RacePrepPage />} />
        <Route path="/qualifying/:eventId" element={<QualifyingPage />} />
        <Route path="/results/:eventId" element={<ResultsPage />} />

        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/predictions" element={<PredictionsPage />} />

        <Route path="/admin/*" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
