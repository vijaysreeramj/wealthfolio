import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Icon from './Icon'
import QuickAdd from './QuickAdd'
import { useAuth } from '../hooks/auth'
import { useTheme } from '../hooks/theme'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/budgets', label: 'Budgets', icon: 'budget' },
  { to: '/investments', label: 'Investments', icon: 'investments' },
  { to: '/net-worth', label: 'Net Worth', icon: 'networth' },
  { to: '/goals', label: 'Financial Goals', icon: 'goals' },
  { to: '/fire', label: 'FIRE Tracker', icon: 'fire' },
  { to: '/advisor', label: 'AI Financial Advisor', icon: 'advisor' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

function ThemeSwitch() {
  const { mode, setMode } = useTheme()
  const options = [
    ['light', 'sun', 'Light'],
    ['dark', 'moon', 'Dark'],
    ['system', 'monitor', 'System'],
  ]
  return (
    <div className="seg" role="radiogroup" aria-label="Theme">
      {options.map(([value, icon, text]) => (
        <button
          key={value}
          role="radio"
          aria-checked={mode === value}
          className={mode === value ? 'on' : ''}
          onClick={() => setMode(value)}
          title={`${text} theme`}
        >
          <Icon name={icon} />
          <span className="hide-mobile">{text}</span>
        </button>
      ))}
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const location = useLocation()
  const current = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="investments" size={16} />
          </span>
          Wealthfolio
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row between">
            <span className="ellipsis" title={user?.email}>
              {user?.name}
            </span>
            <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>
      <div className={`backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <span className="topbar-title">{current?.label}</span>
          <span className="spacer" />
          <ThemeSwitch />
          <button className="btn btn-primary hide-mobile" onClick={() => setQuickAdd(true)}>
            <Icon name="plus" /> Quick add
          </button>
        </header>
        <main className="content">
          <Suspense fallback={<div className="card card-pad muted">Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <button className="fab" onClick={() => setQuickAdd(true)} aria-label="Quick add">
        <Icon name="plus" />
      </button>
      {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} />}
    </div>
  )
}
