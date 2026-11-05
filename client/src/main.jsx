import { StrictMode, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider, useAuth } from './hooks/auth'
import { DataProvider } from './hooks/data'
import { PeriodProvider } from './hooks/period'
import { ThemeProvider } from './hooks/theme'
import '@fontsource-variable/inter'
import './lib/charts'
import './styles/global.css'

function Providers({ children }) {
  const { user, updateProfile } = useAuth()
  // Save the theme to the account so it follows the user across devices
  const persist = useCallback((theme) => user && updateProfile({ theme }).catch(() => {}), [user, updateProfile])
  return (
    <ThemeProvider onPersist={persist}>
      <DataProvider>
        <PeriodProvider>{children}</PeriodProvider>
      </DataProvider>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Providers>
          <App />
        </Providers>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
