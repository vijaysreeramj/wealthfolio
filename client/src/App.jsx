import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './hooks/auth'
import { useTheme } from './hooks/theme'
import Auth from './pages/Auth'
import Budgets from './pages/Budgets'
import Dashboard from './pages/Dashboard'
import Fire from './pages/Fire'
import Goals from './pages/Goals'
import NetWorth from './pages/NetWorth'
import Investments from './pages/Investments'
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
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="investments" element={<Investments />} />
        <Route path="net-worth" element={<NetWorth />} />
        <Route path="goals" element={<Goals />} />
        <Route path="fire" element={<Fire />} />
        <Route path="advisor" element={<Placeholder title="AI Financial Advisor" icon="advisor" />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
