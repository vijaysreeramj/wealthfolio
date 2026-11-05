import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './hooks/auth'
import { useTheme } from './hooks/theme'
import Auth from './pages/Auth'
import Placeholder from './pages/Placeholder'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'

export default function App() {
  const { user } = useAuth()
  const { setMode } = useTheme()

  // Adopt the theme saved on the account when signing in on a new device
  useEffect(() => {
    if (user?.theme) setMode(user.theme, { persist: false })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (user === undefined) return null
  if (!user) return <Auth />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Placeholder title="Dashboard" icon="dashboard" />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budgets" element={<Placeholder title="Budgets" icon="budget" />} />
        <Route path="investments" element={<Placeholder title="Investments" icon="investments" />} />
        <Route path="net-worth" element={<Placeholder title="Net Worth" icon="networth" />} />
        <Route path="goals" element={<Placeholder title="Financial Goals" icon="goals" />} />
        <Route path="fire" element={<Placeholder title="FIRE Tracker" icon="fire" />} />
        <Route path="advisor" element={<Placeholder title="AI Financial Advisor" icon="advisor" />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
