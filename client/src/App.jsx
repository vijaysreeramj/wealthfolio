import { lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './hooks/auth'
import { useTheme } from './hooks/theme'
import Auth from './pages/Auth'

// Each page loads on first visit, keeping the initial download small
const Advisor = lazy(() => import('./pages/Advisor'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Fire = lazy(() => import('./pages/Fire'))
const Goals = lazy(() => import('./pages/Goals'))
const Investments = lazy(() => import('./pages/Investments'))
const NetWorth = lazy(() => import('./pages/NetWorth'))
const Settings = lazy(() => import('./pages/Settings'))
const Transactions = lazy(() => import('./pages/Transactions'))

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
        <Route path="advisor" element={<Advisor />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
