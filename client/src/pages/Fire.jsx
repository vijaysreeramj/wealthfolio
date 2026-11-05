import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import Icon from '../components/Icon'
import { Disclaimer, ErrorBox, Field, Loading, MoneyInput, PageHead, Progress, useSubmit } from '../components/ui'
import { useApi, useData } from '../hooks/data'
import { useChartColors } from '../hooks/theme'
import { api } from '../lib/api'
import { moneyChartOptions } from '../lib/charts'
import { fmtMonthLong, inr, inrShort, pct } from '../lib/format'

const DEFAULTS = {
  current_age: 30,
  retirement_age: 50,
  annual_expenses: '',
  current_portfolio: '',
  use_tracked_portfolio: true,
  monthly_contribution: '',
  inflation_pct: 6,
  return_pct: 10,
  withdrawal_rate_pct: 4,
}

function Pct({ label: text, value, onChange, hint, max = 30 }) {
  return (
    <Field label={text} hint={hint}>
      <div className="input-prefix">
        <input className="input num" type="number" step="0.1" min="0" max={max} value={value} onChange={(e) => onChange(e.target.value)} required />
        <span className="suffix">%</span>
      </div>
    </Field>
  )
}

export default function Fire() {
  const colors = useChartColors()
  const { toast } = useData()
  const { data, error, reload } = useApi(() => api.get('/fire'), [])
  const [f, setF] = useState(DEFAULTS)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!data) return
    setResult(data)
    if (data.profile) setF({ ...DEFAULTS, ...Object.fromEntries(Object.entries(data.profile).map(([k, v]) => [k, v ?? ''])) })
  }, [data])

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }))
  const { submit, busy, error: saveError } = useSubmit(async () => {
    const r = await api.put('/fire', { ...f, current_portfolio: f.current_portfolio || 0, monthly_contribution: f.monthly_contribution || 0 })
    setResult(r)
    toast('FIRE plan updated')
  })

  const head = <PageHead title="FIRE Tracker" subtitle="Financial Independence, Retire Early: how much you need, and when you could get there." />
  if (error) return <>{head}<ErrorBox error={error} onRetry={reload} /></>
  if (!data) return <>{head}<Loading /></>

  const p = result?.plan
  const multiple = f.withdrawal_rate_pct ? (100 / Number(f.withdrawal_rate_pct)).toFixed(1) : '—'

  return (
    <>
      {head}
      <div className="split">
        <form className="card card-pad form split-side" onSubmit={submit}>
          <h2>Your inputs</h2>
          <div className="form-grid">
            <Field label="Current age">
              <input className="input num" type="number" min="15" max="90" value={f.current_age} onChange={set('current_age')} required />
            </Field>
            <Field label="Target retirement age">
              <input className="input num" type="number" min="16" max="100" value={f.retirement_age} onChange={set('retirement_age')} required />
            </Field>
            <Field label="Current annual expenses" full hint={'Today\'s yearly spending you want to sustain. Tip: monthly expenses × 12.'}>
              <MoneyInput value={f.annual_expenses} onChange={set('annual_expenses')} required min="1" />
            </Field>
            <label className="check full">
              <input type="checkbox" checked={f.use_tracked_portfolio} onChange={set('use_tracked_portfolio')} />
              <span>Use my tracked investments ({inrShort(result?.tracked_portfolio)})</span>
            </label>
            {!f.use_tracked_portfolio && (
              <Field label="Current investment portfolio" full>
                <MoneyInput value={f.current_portfolio} onChange={set('current_portfolio')} />
              </Field>
            )}
            <Field label="Monthly investment" full hint="What you invest each month towards FIRE.">
              <MoneyInput value={f.monthly_contribution} onChange={set('monthly_contribution')} />
            </Field>
            <Pct label="Expected inflation" value={f.inflation_pct} onChange={set('inflation_pct')} max={20} />
            <Pct label="Expected return" value={f.return_pct} onChange={set('return_pct')} />
            <Pct label="Withdrawal rate" value={f.withdrawal_rate_pct} onChange={set('withdrawal_rate_pct')} max={10} hint={`= ${multiple}× annual expenses`} />
          </div>
          {saveError && <div className="form-error">{saveError}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Calculating…' : 'Calculate & save'}</button>
        </form>

        <div className="stack">
          {!p ? (
            <div className="card card-pad">
              <h2 style={{ marginBottom: 8 }}>How FIRE works</h2>
              <p className="muted" style={{ marginBottom: 8 }}>
                Your <strong>FIRE number</strong> is the portfolio that could fund your yearly expenses. With the default 4% withdrawal rate, that's <strong>25× your annual expenses</strong>.
              </p>
              <p className="muted">Enter your details and press Calculate to see your FIRE number, progress and an estimated FIRE date.</p>
            </div>
          ) : (
            <>
              <div className="card card-pad">
                <div className="row between wrap">
                  <div>
                    <div className="stat-label"><Icon name="fire" size={15} /> FIRE number (today's rupees)</div>
                    <div className="stat-value" style={{ fontSize: 28 }}>{inr(p.fire_number_today)}</div>
                    <div className="stat-sub">{p.fire_multiple}× annual expenses of {inr(f.annual_expenses)}</div>
                  </div>
                  <span className={`badge ${p.on_track ? 'badge-pos' : 'badge-warn'}`} style={{ fontSize: 13, padding: '4px 10px' }}>
                    {p.on_track ? `On track for age ${f.retirement_age}` : `Not on track for age ${f.retirement_age}`}
                  </span>
                </div>
                <div style={{ margin: '18px 0 6px' }}>
                  <Progress value={p.progress_pct} thresholds={false} />
                </div>
                <div className="row between subtle">
                  <span>{inr(p.current_portfolio)} invested · {pct(p.progress_pct)} there</span>
                  <span>{inr(p.remaining_today)} to go</span>
                </div>
              </div>

              <div className="grid grid-2">
                <div className="card card-pad">
                  <div className="stat-label">FIRE number at age {f.retirement_age}</div>
                  <div className="stat-value">{inrShort(p.fire_number_at_retirement)}</div>
                  <div className="stat-sub">Expenses grow to {inrShort(p.annual_expenses_at_retirement)}/yr at {f.inflation_pct}% inflation</div>
                </div>
                <div className="card card-pad">
                  <div className="stat-label">Required monthly investment</div>
                  <div className="stat-value">{inr(p.required_monthly_investment)}</div>
                  <div className="stat-sub">
                    To reach it by {f.retirement_age}. You invest {inr(f.monthly_contribution || 0)}
                    {Number(p.required_monthly_investment) > Number(f.monthly_contribution || 0)
                      ? `, ${inr(Number(p.required_monthly_investment) - Number(f.monthly_contribution || 0))} short`
                      : ', which is enough'}
                  </div>
                </div>
                <div className="card card-pad">
                  <div className="stat-label">Estimated FIRE date</div>
                  <div className="stat-value">{p.fire_date ? fmtMonthLong(p.fire_date) : 'Not within 100 years'}</div>
                  <div className="stat-sub">{p.fire_age ? `At age ${p.fire_age}, at your current monthly investment` : 'Increase your monthly investment or lower expenses'}</div>
                </div>
                <div className="card card-pad">
                  <div className="stat-label">Projected portfolio at {f.retirement_age}</div>
                  <div className="stat-value">{inrShort(p.projected_portfolio_at_retirement)}</div>
                  <div className="stat-sub">At {f.return_pct}% a year with {inr(f.monthly_contribution || 0)}/month</div>
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h2>Projection</h2><span className="badge badge-warn">Assumption</span></div>
                <div className="card-body">
                  <div className="chart-box">
                    <Line
                      data={{
                        labels: p.projection.map((r) => `Age ${r.age}`),
                        datasets: [
                          { label: 'Projected portfolio', data: p.projection.map((r) => Number(r.portfolio)), borderColor: colors.series[0], backgroundColor: colors.series[0] + '1f', fill: true, tension: 0.25, pointRadius: 0 },
                          { label: 'FIRE number (inflation-adjusted)', data: p.projection.map((r) => Number(r.fire_number)), borderColor: colors.warning, borderDash: [5, 5], tension: 0.25, pointRadius: 0 },
                        ],
                      }}
                      options={moneyChartOptions(colors)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          <Disclaimer>
            {result?.assumptions_note} All projections are estimates, not guaranteed outcomes. Taxes and one-off expenses are not included.
          </Disclaimer>
        </div>
      </div>
    </>
  )
}
