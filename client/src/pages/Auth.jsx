import { useState } from 'react'
import Icon from '../components/Icon'
import { Field, useSubmit } from '../components/ui'
import { useAuth } from '../hooks/auth'

export default function Auth() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const { submit, busy, error, setError } = useSubmit(() =>
    mode === 'login' ? login(form.email, form.password) : register(form),
  )
  const isLogin = mode === 'login'

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="investments" size={16} />
          </span>
          Wealthfolio
        </div>
        <div className="card card-pad">
          <h1 style={{ fontSize: 19 }}>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted" style={{ margin: '4px 0 18px' }}>
            {isLogin ? 'Sign in to see your finances.' : 'Track spending, budgets, investments and goals in one place.'}
          </p>
          <form className="form" onSubmit={submit}>
            {!isLogin && (
              <Field label="Name">
                <input className="input" value={form.name} onChange={set('name')} required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
            </Field>
            <Field label="Password" hint={!isLogin ? 'At least 8 characters.' : undefined}>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                required
                minLength={isLogin ? undefined : 8}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </Field>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary" disabled={busy} style={{ height: 40 }}>
              {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16 }}>
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setError(null)
              setMode(isLogin ? 'register' : 'login')
            }}
          >
            {isLogin ? 'Create one' : 'Sign in'}
          </a>
        </p>
      </div>
    </div>
  )
}
