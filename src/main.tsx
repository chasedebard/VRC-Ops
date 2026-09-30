import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './app/App'
import { redirectWwwToCanonical } from './utils/siteUrl'
import { initAppearance } from './hooks/useAppearance'

initAppearance()

if (!redirectWwwToCanonical()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
