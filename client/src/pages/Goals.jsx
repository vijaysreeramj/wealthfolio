import { useState } from 'react'
import Icon from '../components/Icon'
import { Disclaimer, EmptyState, ErrorBox, Field, Loading, Modal, MoneyInput, PageHead, Progress, StatCard, useSubmit } from '../components/ui'
import { useApi, useData } from '../hooks/data'
import { api } from '../lib/api'
import { fmtDate, fmtMonthLong, inr, isoDate, label } from '../lib/format'

const CATEGORIES = ['car', 'vacation', 'house', 'emergency_fund', 'education', 'other']
const SCENARIO_LABEL = { no_return: 'No return', conservative: 'Conservative', moderate: 'Moderate' }
const STATUS = {
  achieved: ['badge-pos', 'Achieved'],
  on_track: ['badge-pos', 'On track'],
  behind: ['badge-warn', 'Behind'],
  no_plan: ['', 'Add a monthly amount to track'],
}
const PRIORITY = { high: 'badge-danger', medium: 'badge-warn', low: '' }

function GoalForm({ initial, onDone }) {
  const { bump, toast } = useData()
  const nextYear = new Date()
  nextYear.setFullYear(nextYear.getFullYear() + 1)
  const [f, setF] = useState(() => ({
    name: initial?.name || '',
    category: initial?.category || 'other',
    target_amount: initial?.target_amount ?? '',
    current_savings: initial?.current_savings ?? '',
    target_date: initial?.target_date || isoDate(nextYear),
    priority: initial?.priority || 'medium',
    risk_preference: initial?.risk_preference || 'low',
    conservative_return_pct: initial?.conservative_return_pct ?? 6.5,
    moderate_return_pct: initial?.moderate_return_pct ?? 10,
    monthly_contribution: initial?.monthly_contribution ?? '',
    notes: initial?.notes || '',
  }))
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const { submit, busy, error } = useSubmit(async () => {
    const body = { ...f, current_savings: f.current_savings || 0, monthly_contribution: f.monthly_contribution || null, notes: f.notes || null }
    if (initial) await api.put(`/goals/${initial.id}`, body)
    else await api.post('/goals', body)
    toast(initial ? 'Goal updated' : 'Goal added')
    bump()
    onDone()
  })
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Goal name">
          <input className="input" value={f.name} onChange={set('name')} required placeholder="e.g. New car, Europe trip" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={f.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
        </Field>
        <Field label="Target amount">
          <MoneyInput value={f.target_amount} onChange={set('target_amount')} required min="1" />
        </Field>
        <Field label="Saved so far">
          <MoneyInput value={f.current_savings} onChange={set('current_savings')} />
        </Field>
        <Field label="Target date">
          <input className="input" type="date" value={f.target_date} onChange={set('target_date')} required min={isoDate()} />
        </Field>
        <Field label="Monthly saving you plan (optional)" hint="Used to estimate when you'll reach the goal.">
          <MoneyInput value={f.monthly_contribution} onChange={set('monthly_contribution')} />
        </Field>
        <Field label="Priority">
          <select className="select" value={f.priority} onChange={set('priority')}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </Field>
        <Field label="Risk preference" hint="How much short-term ups and downs you can accept.">
          <select className="select" value={f.risk_preference} onChange={set('risk_preference')}>
            <option value="low">Low: protect capital</option>
            <option value="medium">Medium: some ups and downs are OK</option>
            <option value="high">High: comfortable with big swings</option>
          </select>
        </Field>
        <div className="full" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <h3>Projection assumptions</h3>
          <p className="subtle">Annual returns used for the scenarios. These are assumptions. Edit them to match your plan.</p>
        </div>
        <Field label="Conservative return (% p.a.)" hint="e.g. FD / RD / debt funds">
          <input className="input num" type="number" step="0.1" min="0" max="20" value={f.conservative_return_pct} onChange={set('conservative_return_pct')} required />
        </Field>
        <Field label="Moderate return (% p.a.)" hint="e.g. hybrid or partly equity">
          <input className="input num" type="number" step="0.1" min="0" max="20" value={f.moderate_return_pct} onChange={set('moderate_return_pct')} required />
        </Field>
        <Field label="Notes (optional)" full>
          <input className="input" value={f.notes} onChange={set('notes')} maxLength={255} />
        </Field>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save goal' : 'Add goal'}</button>
      </div>
    </form>
  )
}

function GoalCard({ g, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const [statusCls, statusText] = STATUS[g.status]
  return (
    <div className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="row wrap">
            <h2>{g.name}</h2>
            <span className={`badge ${PRIORITY[g.priority]}`}>{g.priority} priority</span>
            <span className={`badge ${statusCls}`}>{statusText}</span>
          </div>
          <p className="subtle">
            {label(g.category)} · by {fmtDate(g.target_date)} · {g.remaining_months} months left · {g.risk_preference} risk
          </p>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${g.name}`}><Icon name="edit" /></button>
          <button className="icon-btn" onClick={onDelete} aria-label={`Delete ${g.name}`}><Icon name="trash" /></button>
        </div>
      </div>
      <div className="card-body">
        <div className="row between" style={{ marginBottom: 6 }}>
          <span className="num"><strong>{inr(g.current_savings)}</strong> <span className="muted">of {inr(g.target_amount)}</span></span>
          <strong>{g.progress_pct}%</strong>
        </div>
        <Progress value={g.progress_pct} thresholds={false} />
        <p className="subtle" style={{ marginTop: 6 }}>{inr(g.remaining_amount)} remaining</p>

        {g.status !== 'achieved' && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="r">Assumed return</th>
                  <th className="r">Save per month</th>
                  {g.monthly_contribution && <th className="r">Done by (at {inr(g.monthly_contribution)}/mo)</th>}
                </tr>
              </thead>
              <tbody>
                {g.scenarios.map((s) => (
                  <tr key={s.name}>
                    <td>{SCENARIO_LABEL[s.name]}</td>
                    <td className="r num">{s.annual_return_pct}%</td>
                    <td className="r num" style={{ fontWeight: 600 }}>{inr(s.required_monthly)}</td>
                    {g.monthly_contribution && (
                      <td className={`r num ${s.estimated_completion && s.estimated_completion <= g.target_date ? 'pos' : 'neg'}`}>
                        {s.estimated_completion ? fmtMonthLong(s.estimated_completion) : 'Over 50 years'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {g.status !== 'achieved' && (
          <>
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => setOpen(!open)}>
              <Icon name={open ? 'down' : 'right'} /> How to save for this goal
            </button>
            {open && (
              <div className="stack" style={{ gap: 10, marginTop: 6 }}>
                <p><strong>{g.guidance.horizon}</strong></p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {g.guidance.options.map((o) => <li key={o}>{o}</li>)}
                </ul>
                <div className="alert alert-warn"><Icon name="alert" /><span>{g.guidance.risk_note}</span></div>
                {g.guidance.return_warning && <div className="alert alert-warn"><Icon name="alert" /><span>{g.guidance.return_warning}</span></div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function Goals() {
  const { bump, toast } = useData()
  const { data, error, reload } = useApi(() => api.get('/goals'), [])
  const [modal, setModal] = useState(null)

  const remove = async (g) => {
    if (!confirm(`Delete the goal "${g.name}"?`)) return
    await api.del(`/goals/${g.id}`)
    toast('Goal deleted')
    bump()
  }

  const head = (
    <PageHead title="Financial Goals" subtitle="Plan for big purchases and milestones, with realistic saving targets.">
      <button className="btn btn-primary" onClick={() => setModal({})}><Icon name="plus" /> Add goal</button>
    </PageHead>
  )
  const form = modal && (
    <Modal title={modal.item ? 'Edit goal' : 'Add goal'} onClose={() => setModal(null)} wide>
      <GoalForm initial={modal.item} onDone={() => setModal(null)} />
    </Modal>
  )
  if (error) return <>{head}<ErrorBox error={error} onRetry={reload} /></>
  if (!data) return <>{head}<Loading /></>

  if (data.items.length === 0)
    return (
      <>
        {head}
        <div className="card">
          <EmptyState icon="goals" title="Set your first goal" action={<button className="btn btn-primary" onClick={() => setModal({})}><Icon name="plus" /> Add a goal</button>}>
            An emergency fund of 6 months' expenses is a good first goal. Then add things like a car, a vacation or a house down payment. You'll see how much to save each month.
          </EmptyState>
        </div>
        {form}
      </>
    )

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid grid-3">
          <StatCard label="Total of all goals" value={inr(data.total_target)} sub={`${data.items.length} goals`} />
          <StatCard label="Saved towards goals" value={inr(data.total_saved)} sub={`${Number(data.total_target) ? ((Number(data.total_saved) / Number(data.total_target)) * 100).toFixed(1) : 0}% overall`} />
          <StatCard label="Monthly saving needed" value={inr(data.total_required_monthly)} sub="Conservative scenario, all open goals" />
        </div>
        {data.items.map((g) => (
          <GoalCard key={g.id} g={g} onEdit={() => setModal({ item: g })} onDelete={() => remove(g)} />
        ))}
        <Disclaimer>
          Projections use the returns you set and are not guaranteed. The no-return scenario shows the amount needed with no growth at all. For goals under 3 years, avoid relying on equity: it can be down when you need the money.
        </Disclaimer>
      </div>
      {form}
    </>
  )
}
