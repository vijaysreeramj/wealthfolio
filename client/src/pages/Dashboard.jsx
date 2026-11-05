import { useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import QuickAdd from '../components/QuickAdd'
import { EmptyState, ErrorBox, Loading, PageHead, PeriodPicker, Progress, StatCard } from '../components/ui'
import { useApi } from '../hooks/data'
import { usePeriod } from '../hooks/period'
import { useChartColors } from '../hooks/theme'
import { api } from '../lib/api'
import { doughnutOptions, moneyChartOptions } from '../lib/charts'
import { fmtDate, fmtMonth, inr, inrShort, label, pct, signClass } from '../lib/format'

function Card({ title, action, children }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}

function GettingStarted({ onAdd }) {
  const steps = [
    ['1', 'Add your bank accounts and cards', 'So balances and net worth are accurate.', <Link key="a" className="btn btn-sm" to="/settings">Add account</Link>],
    ['2', 'Record income and expenses', 'Your salary and day-to-day spending.', <button key="b" className="btn btn-sm" onClick={onAdd}>Quick add</button>],
    ['3', 'Set monthly budgets', 'Get alerts at 75%, 90% and 100%.', <Link key="c" className="btn btn-sm" to="/budgets">Set budgets</Link>],
    ['4', 'Add your investments', 'Stocks, mutual funds, FDs, PPF, EPF, NPS, gold.', <Link key="d" className="btn btn-sm" to="/investments">Add investment</Link>],
  ]
  return (
    <div className="card">
      <EmptyState icon="wallet" title="Welcome to Wealthfolio">
        Four quick steps to see your full financial picture.
      </EmptyState>
      <div className="list" style={{ padding: '0 24px 24px', maxWidth: 640, margin: '0 auto' }}>
        {steps.map(([n, title, sub, action]) => (
          <div key={n} className="list-item">
            <span className="badge badge-info">{n}</span>
            <div className="grow">
              <strong>{title}</strong>
              <div className="subtle">{sub}</div>
            </div>
            {action}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const period = usePeriod()
  const colors = useChartColors()
  const [quickAdd, setQuickAdd] = useState(false)
  const { data: d, error, reload } = useApi(
    () => api.get('/dashboard', { mode: period.mode, start: period.start, end: period.end }),
    [period.mode, period.start, period.end],
  )

  const head = (
    <PageHead title="Dashboard" subtitle={`Your finances for ${period.label}`}>
      <PeriodPicker />
    </PageHead>
  )
  if (error) return <>{head}<ErrorBox error={error} onRetry={reload} /></>
  if (!d) return <>{head}<Loading /></>
  if (!d.has_data)
    return (
      <>
        {head}
        <GettingStarted onAdd={() => setQuickAdd(true)} />
        {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} />}
      </>
    )

  const inv = d.investments
  const nw = d.net_worth
  const nwHist = nw.history
  const nwChange = nwHist.length >= 2 ? Number(nwHist.at(-1).net_worth) - Number(nwHist.at(-2).net_worth) : null
  const periodWord = period.mode === 'month' ? 'Monthly' : 'Yearly'

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid grid-4">
          <StatCard label={`${periodWord} income`} icon="down" value={inr(d.income)} />
          <StatCard label={`${periodWord} expenses`} icon="up" value={inr(d.expense)} sub={period.mode === 'year' ? `Avg ${inr(d.avg_monthly_expense)}/month` : undefined} />
          <StatCard
            label={`${periodWord} savings`}
            value={inr(d.savings)}
            tone={signClass(d.savings)}
            sub={d.savings_rate_pct !== null ? `Savings rate ${pct(d.savings_rate_pct)}` : 'No income recorded'}
          />
          <StatCard
            label="Investments"
            icon="investments"
            value={inrShort(inv.current_value)}
            sub={inv.return_pct !== null ? <span className={signClass(inv.absolute_pl)}>{inr(inv.absolute_pl, { sign: true })} ({pct(inv.return_pct, 1, { sign: true })})</span> : `${inv.count} holdings`}
          />
          <StatCard label="Total assets" value={inrShort(nw.total_assets)} />
          <StatCard label="Total liabilities" value={inrShort(nw.total_liabilities)} />
          <StatCard
            label="Net worth"
            icon="networth"
            value={inrShort(nw.net_worth)}
            tone={signClass(nw.net_worth)}
            sub={nwChange !== null ? <span className={signClass(nwChange)}>{inrShort(nwChange)} vs last month</span> : 'History builds month by month'}
          />
          <div className="card card-pad">
            <div className="stat-label">
              <Icon name="fire" size={15} /> FIRE progress
            </div>
            {d.fire ? (
              <>
                <div className="stat-value">{pct(d.fire.progress_pct)}</div>
                <div style={{ margin: '8px 0 4px' }}>
                  <Progress value={d.fire.progress_pct} thresholds={false} />
                </div>
                <div className="stat-sub">of {inrShort(d.fire.fire_number)} FIRE number</div>
              </>
            ) : (
              <>
                <div className="stat-value muted">—</div>
                <div className="stat-sub">
                  <Link to="/fire">Set up your FIRE plan</Link>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-2">
          <Card title="Income vs expenses">
            <div className="chart-box">
              <Bar
                data={{
                  labels: d.trend.map((t) => fmtMonth(t.month)),
                  datasets: [
                    { label: 'Income', data: d.trend.map((t) => Number(t.income)), backgroundColor: colors.positive, borderRadius: 4 },
                    { label: 'Expenses', data: d.trend.map((t) => Number(t.expense)), backgroundColor: colors.negative, borderRadius: 4 },
                  ],
                }}
                options={moneyChartOptions(colors)}
              />
            </div>
          </Card>
          <Card title="Where the money went">
            {d.expense_breakdown.length ? (
              <div className="chart-box">
                <Doughnut
                  data={{
                    labels: d.expense_breakdown.map((e) => e.category),
                    datasets: [
                      {
                        data: d.expense_breakdown.map((e) => Number(e.amount)),
                        backgroundColor: d.expense_breakdown.map((e) => e.color),
                        borderColor: colors.surface,
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={doughnutOptions(colors)}
                />
              </div>
            ) : (
              <p className="muted">No expenses in {period.label}.</p>
            )}
          </Card>
        </div>

        <div className="grid grid-2">
          <Card title="Net worth growth" action={<Link to="/net-worth" className="subtle">Details →</Link>}>
            <div className="chart-box">
              <Line
                data={{
                  labels: nwHist.map((h) => fmtMonth(h.month)),
                  datasets: [
                    {
                      label: 'Net worth',
                      data: nwHist.map((h) => Number(h.net_worth)),
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + '22',
                      fill: true,
                      tension: 0.3,
                      pointRadius: 3,
                    },
                  ],
                }}
                options={moneyChartOptions(colors, { legend: false })}
              />
            </div>
            {nwHist.length < 2 && <p className="subtle" style={{ marginTop: 8 }}>A snapshot is saved each month, so this chart grows over time.</p>}
          </Card>
          <Card title="Budget utilisation" action={<Link to="/budgets" className="subtle">Manage →</Link>}>
            {d.budget.items.length ? (
              <div className="list">
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span className="muted">
                    {inr(d.budget.total_spent)} of {inr(d.budget.total_budget)}
                  </span>
                  <strong>{d.budget.utilization_pct}%</strong>
                </div>
                {[...d.budget.items]
                  .sort((a, b) => b.utilization_pct - a.utilization_pct)
                  .slice(0, 6)
                  .map((b) => (
                    <div key={b.category_name} style={{ padding: '7px 0' }}>
                      <div className="row between" style={{ marginBottom: 5 }}>
                        <span className="row">
                          <span className="dot" style={{ background: b.category_color }} />
                          {b.category_name}
                          {b.utilization_pct >= 75 && <Icon name="alert" size={14} className={b.utilization_pct >= 100 ? 'neg' : ''} />}
                        </span>
                        <span className="subtle num">
                          {inr(b.spent)} / {inr(b.amount)}
                        </span>
                      </div>
                      <Progress value={b.utilization_pct} />
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState icon="budget" title="No budgets yet" action={<Link className="btn btn-sm" to="/budgets">Set budgets</Link>} />
            )}
          </Card>
        </div>

        <div className="grid grid-2">
          <Card title="Investment portfolio" action={<Link to="/investments" className="subtle">View all →</Link>}>
            {inv.count ? (
              <>
                <div className="grid grid-3" style={{ gap: 12, marginBottom: 16 }}>
                  <div>
                    <div className="subtle">Invested</div>
                    <div className="num" style={{ fontWeight: 600 }}>{inrShort(inv.total_invested)}</div>
                  </div>
                  <div>
                    <div className="subtle">Current value</div>
                    <div className="num" style={{ fontWeight: 600 }}>{inrShort(inv.current_value)}</div>
                  </div>
                  <div>
                    <div className="subtle">Returns</div>
                    <div className={`num ${signClass(inv.absolute_pl)}`} style={{ fontWeight: 600 }}>
                      {pct(inv.return_pct, 1, { sign: true })}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
                  {inv.by_type.map((t, i) => (
                    <div key={t.type} title={`${label(t.type)} ${t.allocation_pct}%`} style={{ width: `${t.allocation_pct}%`, background: colors.series[i % colors.series.length] }} />
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 12 }}>
                  {inv.by_type.map((t, i) => (
                    <span key={t.type} className="row subtle" style={{ gap: 6 }}>
                      <span className="dot" style={{ background: colors.series[i % colors.series.length] }} />
                      {label(t.type)} {t.allocation_pct}%
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon="investments" title="No investments yet" action={<Link className="btn btn-sm" to="/investments">Add investment</Link>} />
            )}
          </Card>
          <Card title="Recent transactions" action={<Link to="/transactions" className="subtle">View all →</Link>}>
            {d.recent_transactions.length ? (
              <div className="list">
                {d.recent_transactions.map((t) => (
                  <div key={t.id} className="list-item">
                    <span className="dot" style={{ background: t.category_color || 'var(--info)' }} />
                    <div className="grow">
                      <div className="ellipsis" style={{ fontWeight: 550 }}>
                        {t.type === 'transfer' ? (t.is_linked ? `Investment · ${t.investment_name || ''}` : 'Transfer') : t.category_name}
                      </div>
                      <div className="subtle ellipsis">
                        {fmtDate(t.date)}
                        {t.note ? ` · ${t.note}` : ''}
                      </div>
                    </div>
                    <span className={`num ${t.type === 'income' ? 'pos' : ''}`} style={{ fontWeight: 600 }}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                      {inr(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No transactions yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
