import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { ErrorBox, Field, Loading, Modal, MoneyInput, PageHead, StatCard, useSubmit } from '../components/ui'
import { useApi, useData } from '../hooks/data'
import { useChartColors } from '../hooks/theme'
import { api } from '../lib/api'
import { moneyChartOptions } from '../lib/charts'
import { fmtDate, fmtMonth, fmtMonthLong, inr, inrShort, label, signClass } from '../lib/format'

const GROUP_LABEL = {
  bank: 'Bank balance',
  cash: 'Cash',
  stocks: 'Stocks',
  mutual_funds: 'Mutual funds & SIPs',
  fd_rd: 'FD / RD',
  retirement: 'PPF / EPF / NPS',
  gold: 'Gold',
  property: 'Property',
  other_assets: 'Other assets',
  loans: 'Loans',
  credit_cards: 'Credit card outstanding',
  other_debts: 'Other debts',
}

function AssetForm({ initial, onDone }) {
  const { bump, toast } = useData()
  const [f, setF] = useState({ name: initial?.name || '', type: initial?.type || 'property', value: initial?.value ?? '', notes: initial?.notes || '' })
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const { submit, busy, error } = useSubmit(async () => {
    const body = { ...f, notes: f.notes || null }
    if (initial) await api.put(`/net-worth/assets/${initial.id}`, body)
    else await api.post('/net-worth/assets', body)
    toast(initial ? 'Asset updated' : 'Asset added')
    bump()
    onDone()
  })
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={f.name} onChange={set('name')} required placeholder="e.g. Flat in Pune" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={f.type} onChange={set('type')}>
            {['property', 'gold_physical', 'vehicle', 'other'].map((t) => (
              <option key={t} value={t}>{label(t)}</option>
            ))}
          </select>
        </Field>
        <Field label="Current market value" hint={initial ? 'Changing it saves the old value to history.' : undefined} full>
          <MoneyInput value={f.value} onChange={set('value')} required />
        </Field>
        <Field label="Notes (optional)" full>
          <input className="input" value={f.notes} onChange={set('notes')} maxLength={255} />
        </Field>
      </div>
      <div className="alert alert-info">
        <Icon name="info" />
        <span>
          Only add things that aren't tracked elsewhere. Bank balances come from Accounts, and gold ETFs/SGBs belong in Investments. Home loans go in Accounts as a Loan.
        </span>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

function Breakdown({ title, groups, total, tone }) {
  const rows = Object.entries(groups).filter(([, v]) => Number(v) !== 0)
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <strong className={`num ${tone}`}>{inr(total)}</strong>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="muted">Nothing here yet.</p>
        ) : (
          <div className="list">
            {rows.map(([k, v]) => (
              <div key={k} className="list-item">
                <span className="grow">{GROUP_LABEL[k]}</span>
                <span className="subtle num">{Number(total) ? ((Number(v) / Number(total)) * 100).toFixed(1) : 0}%</span>
                <span className="num" style={{ minWidth: 110, textAlign: 'right', fontWeight: 600 }}>{inr(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function NetWorth() {
  const colors = useChartColors()
  const { bump, toast } = useData()
  const { data: d, error, reload } = useApi(() => api.get('/net-worth'), [])
  const [modal, setModal] = useState(null)

  const head = <PageHead title="Net Worth" subtitle="Everything you own minus everything you owe." />
  if (error) return <>{head}<ErrorBox error={error} onRetry={reload} /></>
  if (!d) return <>{head}<Loading /></>

  const removeAsset = async (a) => {
    if (!confirm(`Delete "${a.name}"?`)) return
    await api.del(`/net-worth/assets/${a.id}`)
    toast('Asset deleted')
    bump()
  }
  const assetAccounts = d.accounts.filter((a) => ['bank', 'cash'].includes(a.type))
  const liabilityAccounts = d.accounts.filter((a) => !['bank', 'cash'].includes(a.type))

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid grid-4">
          <StatCard label="Total assets" value={inr(d.total_assets)} />
          <StatCard label="Total liabilities" value={inr(d.total_liabilities)} />
          <StatCard label="Net worth" icon="networth" value={inr(d.net_worth)} tone={signClass(d.net_worth)} />
          <StatCard
            label="Change this month"
            value={d.monthly_change === null ? '—' : inr(d.monthly_change, { sign: true })}
            tone={signClass(d.monthly_change)}
            sub={d.monthly_change === null ? 'Available from next month' : `vs ${fmtMonthLong(d.previous_month)}`}
          />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Net worth over time</h2>
          </div>
          <div className="card-body">
            <div className="chart-box">
              <Line
                data={{
                  labels: d.history.map((h) => fmtMonth(h.month)),
                  datasets: [
                    { label: 'Net worth', data: d.history.map((h) => Number(h.net_worth)), borderColor: colors.primary, backgroundColor: colors.primary + '22', fill: true, tension: 0.3, pointRadius: 3 },
                    { label: 'Assets', data: d.history.map((h) => Number(h.total_assets)), borderColor: colors.positive, borderDash: [4, 4], tension: 0.3, pointRadius: 2 },
                    { label: 'Liabilities', data: d.history.map((h) => Number(h.total_liabilities)), borderColor: colors.negative, borderDash: [4, 4], tension: 0.3, pointRadius: 2 },
                  ],
                }}
                options={moneyChartOptions(colors)}
              />
            </div>
            <p className="subtle" style={{ marginTop: 8 }}>
              A snapshot is saved automatically each month you use the app. {d.history.length < 2 && 'Come back next month to see the trend.'}
            </p>
          </div>
        </div>

        <div className="grid grid-2">
          <Breakdown title="Assets" groups={d.assets} total={d.total_assets} tone="pos" />
          <Breakdown title="Liabilities" groups={d.liabilities} total={d.total_liabilities} tone="neg" />
        </div>

        <div className="grid grid-3">
          <div className="card">
            <div className="card-head">
              <h2>Accounts</h2>
              <Link to="/settings" className="subtle">Manage →</Link>
            </div>
            <div className="card-body">
              <div className="list">
                {assetAccounts.map((a) => (
                  <div key={a.id} className="list-item">
                    <span className="grow ellipsis">{a.name}<div className="subtle">{label(a.type)}</div></span>
                    <span className="num">{inr(a.balance)}</span>
                  </div>
                ))}
                {liabilityAccounts.map((a) => (
                  <div key={a.id} className="list-item">
                    <span className="grow ellipsis">{a.name}<div className="subtle">{label(a.type)} · owed</div></span>
                    <span className="num neg">{inr(a.balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Investments</h2>
              <Link to="/investments" className="subtle">Manage →</Link>
            </div>
            <div className="card-body">
              {d.investments.length === 0 ? (
                <p className="muted">No investments yet.</p>
              ) : (
                <div className="list">
                  {d.investments.map((i) => (
                    <div key={i.id} className="list-item">
                      <span className="grow ellipsis">{i.name}<div className="subtle">{label(i.type)}</div></span>
                      <span className="num">{inrShort(i.current_value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Other assets</h2>
              <button className="btn btn-sm btn-primary" onClick={() => setModal({})}>
                <Icon name="plus" /> Add
              </button>
            </div>
            <div className="card-body">
              {d.manual_assets.length === 0 ? (
                <p className="muted">Property, physical gold, vehicles and anything else you own.</p>
              ) : (
                <div className="list">
                  {d.manual_assets.map((a) => (
                    <div key={a.id} className="list-item">
                      <span className="grow ellipsis">
                        {a.name}
                        <div className="subtle">
                          {label(a.type)} · updated {fmtDate(a.valuations.at(-1)?.as_of)}
                        </div>
                      </span>
                      <span className="num">{inrShort(a.value)}</span>
                      <button className="icon-btn" onClick={() => setModal({ item: a })} aria-label={`Edit ${a.name}`}><Icon name="edit" /></button>
                      <button className="icon-btn" onClick={() => removeAsset(a)} aria-label={`Delete ${a.name}`}><Icon name="trash" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="alert alert-info">
          <Icon name="info" />
          <span>
            <strong>No double counting:</strong> bank and cash balances come from your accounts, investments from their current value, and other assets from what you enter here. Money moved into an investment leaves your bank balance, so it's only counted once. Liabilities are what you still owe on cards and loans.
          </span>
        </div>
      </div>
      {modal && (
        <Modal title={modal.item ? 'Edit asset' : 'Add asset'} onClose={() => setModal(null)}>
          <AssetForm initial={modal.item} onDone={() => setModal(null)} />
        </Modal>
      )}
    </>
  )
}
