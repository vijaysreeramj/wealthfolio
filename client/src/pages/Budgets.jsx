import { useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { EmptyState, ErrorBox, Field, Modal, MoneyInput, PageHead, PeriodPicker, Progress, StatCard, useSubmit } from '../components/ui'
import { useApi, useData } from '../hooks/data'
import { usePeriod } from '../hooks/period'
import { useChartColors } from '../hooks/theme'
import { api } from '../lib/api'
import { moneyChartOptions } from '../lib/charts'
import { fmtMonth, fmtMonthLong, inr, isoDate } from '../lib/format'

const ALERT = {
  warning: { cls: 'badge-warn', text: '75%+ used' },
  critical: { cls: 'badge-neg', text: '90%+ used' },
  exceeded: { cls: 'badge-danger', text: 'Over budget' },
}

function BudgetForm({ month, initial, existing, onDone }) {
  const { bump, toast } = useData()
  const cats = useApi(() => api.get('/categories'), [])
  const options = (cats.data || []).filter((c) => c.kind === 'expense' && !c.is_archived && !existing.includes(c.id))
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState(initial?.amount ?? '')
  const { submit, busy, error } = useSubmit(async () => {
    if (initial) await api.put(`/budgets/${initial.id}`, { amount })
    else await api.post('/budgets', { category_id: Number(categoryId), month, amount })
    toast(initial ? 'Budget updated' : 'Budget added')
    bump()
    onDone()
  })
  return (
    <form className="form" onSubmit={submit}>
      {initial ? (
        <p className="muted">
          {initial.category_name} · {fmtMonthLong(month)}
        </p>
      ) : (
        <Field label="Category" hint={<>Need a new one? <Link to="/settings">Add a custom category</Link>.</>}>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required autoFocus>
            <option value="">Choose…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Monthly budget">
        <MoneyInput value={amount} onChange={setAmount} required min="1" autoFocus={!!initial} />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save budget'}
        </button>
      </div>
    </form>
  )
}

export default function Budgets() {
  const period = usePeriod()
  const month = period.month
  const colors = useChartColors()
  const { bump, toast } = useData()
  const [modal, setModal] = useState(null)
  const { data, error, reload } = useApi(() => api.get('/budgets', { month }), [month])
  const history = useApi(() => api.get('/budgets/history', { months: 6, end: month }), [month])
  const prevMonth = isoDate(new Date(new Date(`${month}T00:00:00`).getFullYear(), new Date(`${month}T00:00:00`).getMonth() - 1, 1))
  const prev = useApi(() => api.get('/budgets', { month: prevMonth }), [prevMonth])

  const remove = async (b) => {
    if (!confirm(`Remove the ${b.category_name} budget for ${fmtMonthLong(month)}?`)) return
    await api.del(`/budgets/${b.id}`)
    toast('Budget removed')
    bump()
  }
  const copyPrev = async () => {
    const r = await api.post('/budgets/copy', { from_month: prevMonth, to_month: month })
    toast(`Copied ${r.copied} budget${r.copied === 1 ? '' : 's'} from ${fmtMonthLong(prevMonth)}`)
    bump()
  }

  const items = data?.items || []
  const alerts = items.filter((i) => i.alert)
  const canCopy = items.length === 0 && (prev.data?.items.length || 0) > 0

  return (
    <>
      <PageHead title="Budgets" subtitle="Set monthly limits per category and see how much is left.">
        {period.mode === 'year' && (
          <button className="btn btn-sm" onClick={() => period.setMode('month')}>
            Switch to monthly view
          </button>
        )}
        <PeriodPicker allowYear={false} />
        <button className="btn btn-primary" onClick={() => setModal({})}>
          <Icon name="plus" /> Add budget
        </button>
      </PageHead>
      <ErrorBox error={error} onRetry={reload} />

      {data && items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="budget"
            title={`No budgets for ${fmtMonthLong(month)}`}
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                {canCopy && (
                  <button className="btn" onClick={copyPrev}>
                    <Icon name="copy" /> Copy {prev.data.items.length} from {fmtMonth(prevMonth)}
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => setModal({})}>
                  <Icon name="plus" /> Add a budget
                </button>
              </div>
            }
          >
            Start with your biggest spending categories, like outside food ₹5,000, groceries ₹4,000 or transport ₹2,000. You'll get alerts at 75%, 90% and 100%.
          </EmptyState>
        </div>
      ) : (
        data && (
          <div className="stack">
            <div className="grid grid-4">
              <StatCard label="Total budget" value={inr(data.total_budget)} />
              <StatCard label="Spent" value={inr(data.total_spent)} sub="In budgeted categories" />
              <StatCard
                label="Remaining"
                value={inr(data.total_remaining)}
                tone={Number(data.total_remaining) < 0 ? 'neg' : 'pos'}
              />
              <div className="card card-pad">
                <div className="stat-label">Utilisation</div>
                <div className="stat-value">{data.utilization_pct}%</div>
                <div style={{ marginTop: 10 }}>
                  <Progress value={data.utilization_pct} />
                </div>
              </div>
            </div>

            {alerts.length > 0 && (
              <div className={`alert ${alerts.some((a) => a.alert === 'exceeded') ? 'alert-danger' : 'alert-warn'}`}>
                <Icon name="alert" />
                <div>
                  {alerts.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ' · '}
                      <strong>{a.category_name}</strong>{' '}
                      {a.alert === 'exceeded'
                        ? Number(a.remaining) < 0
                          ? `is over budget by ${inr(-a.remaining)}`
                          : 'has used its full budget'
                        : `has used ${a.utilization_pct}% (${inr(a.remaining)} left)`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2>Budget vs actual</h2>
              </div>
              <div className="card-body">
                <div className="list">
                  {items.map((b) => (
                    <div key={b.id} className="list-item" style={{ display: 'block', padding: '12px 0' }}>
                      <div className="row between wrap" style={{ marginBottom: 8 }}>
                        <div className="row">
                          <span className="dot" style={{ background: b.category_color }} />
                          <strong>{b.category_name}</strong>
                          {b.alert && (
                            <span className={`badge ${ALERT[b.alert].cls}`}>
                              {b.alert === 'exceeded' && Number(b.remaining) >= 0 ? 'Limit reached' : ALERT[b.alert].text}
                            </span>
                          )}
                        </div>
                        <div className="row">
                          <span className="num">
                            <strong>{inr(b.spent)}</strong> <span className="muted">of {inr(b.amount)}</span>
                          </span>
                          <button className="icon-btn" onClick={() => setModal({ item: b })} aria-label={`Edit ${b.category_name} budget`}>
                            <Icon name="edit" />
                          </button>
                          <button className="icon-btn" onClick={() => remove(b)} aria-label={`Delete ${b.category_name} budget`}>
                            <Icon name="trash" />
                          </button>
                        </div>
                      </div>
                      <Progress value={b.utilization_pct} />
                      <div className="row between subtle" style={{ marginTop: 6 }}>
                        <span>{b.utilization_pct}% used</span>
                        <span className={Number(b.remaining) < 0 ? 'neg' : ''}>
                          {Number(b.remaining) < 0 ? `${inr(-b.remaining)} over` : `${inr(b.remaining)} left`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-head">
                  <h2>Last 6 months</h2>
                </div>
                <div className="card-body">
                  <div className="chart-box">
                    {history.data && (
                      <Bar
                        data={{
                          labels: history.data.map((h) => fmtMonth(h.month)),
                          datasets: [
                            { label: 'Budget', data: history.data.map((h) => Number(h.total_budget)), backgroundColor: colors.grid, borderRadius: 4 },
                            { label: 'Spent', data: history.data.map((h) => Number(h.total_spent)), backgroundColor: colors.primary, borderRadius: 4 },
                          ],
                        }}
                        options={moneyChartOptions(colors)}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-head">
                  <div>
                    <h2>Spending without a budget</h2>
                    <p className="subtle">{inr(data.unbudgeted_spent)} this month</p>
                  </div>
                </div>
                <div className="card-body">
                  {data.unbudgeted.length === 0 ? (
                    <p className="muted">All of this month's spending is in budgeted categories.</p>
                  ) : (
                    <div className="list">
                      {data.unbudgeted.map((u) => (
                        <div key={u.category_id} className="list-item">
                          <span className="dot" style={{ background: u.category_color }} />
                          <span className="grow">{u.category_name}</span>
                          <span className="num">{inr(u.spent)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {modal && (
        <Modal title={modal.item ? 'Edit budget' : `Add budget · ${fmtMonthLong(month)}`} onClose={() => setModal(null)}>
          <BudgetForm month={month} initial={modal.item} existing={items.map((i) => i.category_id)} onDone={() => setModal(null)} />
        </Modal>
      )}
    </>
  )
}
