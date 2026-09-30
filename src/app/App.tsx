import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/app/AuthProvider'
import { LeagueSessionProvider } from '@/app/LeagueSessionProvider'
import { EntitlementProvider } from '@/app/EntitlementProvider'
import { AppRoutes } from '@/routes/AppRoutes'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <LeagueSessionProvider>
            <EntitlementProvider>
              <AppRoutes />
            </EntitlementProvider>
          </LeagueSessionProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
