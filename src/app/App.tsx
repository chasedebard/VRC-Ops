import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/app/AuthProvider'
import { LeagueSessionProvider } from '@/app/LeagueSessionProvider'
import { AppRoutes } from '@/routes/AppRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LeagueSessionProvider>
          <AppRoutes />
        </LeagueSessionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
