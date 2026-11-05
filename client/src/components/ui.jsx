import { useEffect, useState } from 'react'
import Icon from './Icon'
import { usePeriod } from '../hooks/period'

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function StatCard({ label, value, sub, tone, icon }) {
  return (
    <div className="card card-pad">
      <div className="stat-label">
        {icon && <Icon name={icon} size={15} />}
        {label}
      </div>
      <div className={`stat-value ${tone || ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

/** Utilisation bar; colour changes at 75%, 90% and 100%. */
export function Progress({ value, thresholds = true }) {
  const v = Math.max(0, Number(value) || 0)
  let cls = ''
  if (thresholds) cls = v >= 100 ? 'over' : v >= 90 ? 'high' : v >= 75 ? 'warn' : ''
  return (
    <div className={`progress ${cls}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(v, 100)}%` }} />
    </div>
  )
}

export function Field({ label, hint, children, full }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>
        {label}
        {children}
      </label>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function MoneyInput({ value, onChange, ...rest }) {
  return (
    <div className="input-prefix">
      <span>₹</span>
      <input
        className="input num"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  )
}

export function Loading() {
  return <div className="card card-pad muted">Loading…</div>
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="alert alert-danger">
      <Icon name="alert" />
      <div>
        {error.message || String(error)}{' '}
        {onRetry && (
          <button className="btn btn-sm btn-ghost" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

export function Disclaimer({ children }) {
  return (
    <p className="disclaimer">
      <Icon name="info" />
      <span>{children}</span>
    </p>
  )
}

export function PeriodPicker({ allowYear = true }) {
  const p = usePeriod()
  return (
    <div className="row wrap">
      {allowYear && (
        <div className="seg" role="group" aria-label="Period">
          <button className={p.mode === 'month' ? 'on' : ''} onClick={() => p.setMode('month')}>
            Monthly
          </button>
          <button className={p.mode === 'year' ? 'on' : ''} onClick={() => p.setMode('year')}>
            Yearly
          </button>
        </div>
      )}
      <div className="row" style={{ gap: 2 }}>
        <button className="icon-btn" onClick={p.prev} aria-label="Previous period">
          <Icon name="left" />
        </button>
        <span style={{ minWidth: 120, textAlign: 'center', fontWeight: 600 }}>{p.label}</span>
        <button className="icon-btn" onClick={p.next} aria-label="Next period">
          <Icon name="right" />
        </button>
      </div>
      {!p.isCurrent && (
        <button className="btn btn-sm btn-ghost" onClick={p.reset}>
          Today
        </button>
      )}
    </div>
  )
}

/** Wraps a form submit: handles busy state and error display. */
export function useSubmit(fn) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return { submit, busy, error, setError }
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  )
}
