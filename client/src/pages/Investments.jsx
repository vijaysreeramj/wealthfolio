import { useEffect, useMemo, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { InvestmentForm, MARKET, TxnForm, ValueForm, txnLabel } from '../components/InvestmentForms'
import { Disclaimer, EmptyState, ErrorBox, Loading, Modal, PageHead, StatCard } from '../components/ui'
import { useApi, useData } from '../hooks/data'
import { useChartColors } from '../hooks/theme'
import { api } from '../lib/api'
import { doughnutOptions } from '../lib/charts'
import { fmtDate, fmtNum, inr, inrShort, label, pct, signClass } from '../lib/format'

const CLASS_LABEL = { equity: 'Equity & equity MFs', debt: 'Fixed income (FD/RD/PPF/EPF)', retirement: 'NPS', gold: 'Gold', other: 'Other' }
const SOURCE_LABEL = { market_price: 'Market price', manual: 'Manual value', calculated: 'Calculated from rate', cost: 'At cost' }

function Detail({ id, onClose }) {
  const { bump, toast } = useData()
  const { data: inv, error, reload } = useApi(() => api.get(`/investments/${id}`), [id])
  const [modal, setModal] = useState(null)

  if (error) return <Modal title="Investment" onClose={onClose}><ErrorBox error={error} onRetry={reload} /></Modal>
  if (!inv) return null
  const m = inv.metrics
  const market = MARKET.includes(inv.type)

  const removeTxn = async (t) => {
    if (!confirm(`Delete this ${txnLabel(t.type).toLowerCase()} of ${inr(t.amount)}? Any linked bank entry is removed too.`)) return
    try {
      await api.del(`/investments/${inv.id}/txns/${t.id}`)
      toast('Entry deleted')
      bump()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const removeInv = async () => {
    if (!confirm(`Delete "${inv.name}" and all its entries? Linked bank entries are removed too. To keep history, mark it closed instead.`)) return
    await api.del(`/investments/${inv.id}`)
    toast('Investment deleted')
    bump()
    onClose()
  }

  const facts = [
    ['Type', label(inv.type)],
    inv.institution && ['Broker / institution', inv.institution],
    inv.folio_number && ['Folio / account no.', inv.folio_number],
    market && ['Units held', fmtNum(m.units)],
    market && m.avg_cost && ['Average cost', inr(m.avg_cost, { paise: true })],
    market && ['Current price / NAV', inv.current_price ? `${inr(inv.current_price, { paise: true })} · ${fmtDate(inv.price_updated_at)}` : 'Not set'],
    inv.interest_rate && ['Interest rate', `${Number(inv.interest_rate)}% p.a. · ${label(inv.compounding)}`],
    inv.installment_amount && [inv.type === 'sip' ? 'SIP amount' : 'Monthly instalment', inr(inv.installment_amount)],
    inv.start_date && ['Start date', fmtDate(inv.start_date)],
    inv.maturity_date && ['Maturity date', fmtDate(inv.maturity_date)],
    m.maturity_value && ['Expected maturity value', inr(m.maturity_value)],
    ['Value based on', SOURCE_LABEL[m.value_source]],
  ].filter(Boolean)

  return (
    <Modal title={inv.name} onClose={onClose} wide>
      <div className="stack">
        <div className="row wrap">
          {inv.is_closed && <span className="badge">Closed</span>}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => setModal({ kind: 'value' })}>
            <Icon name="refresh" /> Update {market ? 'price' : 'value'}
          </button>
          <button className="btn btn-sm" onClick={() => setModal({ kind: 'edit' })}>
            <Icon name="edit" /> Edit
          </button>
          <button className="btn btn-sm btn-danger" onClick={removeInv}>
            <Icon name="trash" /> Delete
          </button>
        </div>

        <div className="grid grid-4" style={{ gap: 10 }}>
          {[
            ['Invested', inr(m.invested)],
            ['Current value', inr(m.current_value)],
            ['Profit / loss', <span key="p" className={signClass(m.unrealized_pl)}>{inr(m.unrealized_pl, { sign: true })}</span>],
            ['Return', <span key="r" className={signClass(m.unrealized_pl)}>{pct(m.return_pct, 2, { sign: true })}</span>],
          ].map(([k, v]) => (
            <div key={k} className="card" style={{ padding: '10px 12px', boxShadow: 'none' }}>
              <div className="subtle">{k}</div>
              <div className="num" style={{ fontWeight: 650, fontSize: 16 }}>{v}</div>
            </div>
          ))}
        </div>
        {(Number(m.realized_pl) !== 0 || Number(m.income) !== 0) && (
          <p className="muted">
            Realised profit from sales: <span className={signClass(m.realized_pl)}>{inr(m.realized_pl, { sign: true })}</span> · Dividends/interest received: {inr(m.income)}
          </p>
        )}
        {m.notes.map((n) => (
          <div key={n} className="alert alert-info">
            <Icon name="info" />
            {n}
          </div>
        ))}

        <div className="grid grid-2" style={{ gap: '6px 24px' }}>
          {facts.map(([k, v]) => (
            <div key={k} className="row between" style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
              <span className="muted">{k}</span>
              <span className="num" style={{ textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
        {inv.notes && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</p>}
        {m.maturity_value && <Disclaimer>Maturity value assumes the stated rate holds and deposits stay invested until maturity. TDS and taxes are not deducted.</Disclaimer>}

        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h3>History</h3>
            <button className="btn btn-sm btn-primary" onClick={() => setModal({ kind: 'txn' })}>
              <Icon name="plus" /> Add entry
            </button>
          </div>
          {inv.txns.length === 0 ? (
            <p className="muted">
              {inv.type === 'rd' ? 'Instalments are assumed paid on schedule. Record deposits to track them exactly.' : 'No entries yet.'}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entry</th>
                    {market && <th className="r">Units</th>}
                    {market && <th className="r">Price</th>}
                    <th className="r">Amount</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {inv.txns.map((t) => (
                    <tr key={t.id}>
                      <td className="num">{fmtDate(t.date)}</td>
                      <td>
                        <span className={`badge ${['buy', 'deposit'].includes(t.type) ? 'badge-info' : ['sell', 'withdrawal'].includes(t.type) ? 'badge-warn' : 'badge-pos'}`}>{txnLabel(t.type)}</span>
                        {t.account_name && <div className="subtle">{['buy', 'deposit'].includes(t.type) ? 'from' : 'to'} {t.account_name}</div>}
                        {t.note && <div className="subtle">{t.note}</div>}
                      </td>
                      {market && <td className="r num">{t.units ? fmtNum(t.units) : '—'}</td>}
                      {market && <td className="r num">{t.price ? inr(t.price, { paise: true }) : '—'}</td>}
                      <td className="r num">{inr(t.amount, { paise: true })}</td>
                      <td className="actions">
                        <button className="icon-btn" onClick={() => setModal({ kind: 'txn', item: t })} aria-label="Edit entry">
                          <Icon name="edit" />
                        </button>
                        <button className="icon-btn" onClick={() => removeTxn(t)} aria-label="Delete entry">
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal?.kind === 'edit' && (
        <Modal title="Edit investment" onClose={() => setModal(null)} wide>
          <InvestmentForm initial={inv} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'txn' && (
        <Modal title={modal.item ? 'Edit entry' : `Add entry · ${inv.name}`} onClose={() => setModal(null)}>
          <TxnForm investment={inv} initial={modal.item} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'value' && (
        <Modal title={`Update ${market ? 'price' : 'value'} · ${inv.name}`} onClose={() => setModal(null)}>
          <ValueForm investment={inv} onDone={() => setModal(null)} />
        </Modal>
      )}
    </Modal>
  )
}

export default function Investments() {
  const colors = useChartColors()
  const [params, setParams] = useSearchParams()
  const { data, error, reload } = useApi(() => api.get('/investments'), [])
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState(null)
  const [quickValue, setQuickValue] = useState(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    if (params.get('new')) {
      setAdding(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const items = useMemo(
    () =>
      (data?.items || []).filter(
        (i) =>
          (showClosed || !i.is_closed) &&
          (!type || i.type === type) &&
          (!q || `${i.name} ${i.institution || ''} ${i.symbol || ''} ${i.folio_number || ''}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, type, showClosed],
  )

  const head = (
    <PageHead title="Investments" subtitle="Stocks, mutual funds, deposits, retirement schemes and gold in one place.">
      <button className="btn btn-primary" onClick={() => setAdding(true)}>
        <Icon name="plus" /> Add investment
      </button>
    </PageHead>
  )
  const modals = (
    <>
      {adding && (
        <Modal title="Add investment" onClose={() => setAdding(false)} wide>
          <InvestmentForm onDone={(r) => { setAdding(false); r?.id && setDetail(r.id) }} />
        </Modal>
      )}
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
      {quickValue && (
        <Modal title={`Update ${MARKET.includes(quickValue.type) ? 'price' : 'value'} · ${quickValue.name}`} onClose={() => setQuickValue(null)}>
          <ValueForm investment={quickValue} onDone={() => setQuickValue(null)} />
        </Modal>
      )}
    </>
  )

  if (error) return <>{head}<ErrorBox error={error} onRetry={reload} /></>
  if (!data) return <>{head}<Loading /></>
  const s = data.summary
  const closedCount = data.items.filter((i) => i.is_closed).length

  if (data.items.length === 0)
    return (
      <>
        {head}
        <div className="card">
          <EmptyState icon="investments" title="Track all your investments" action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add your first investment</button>}>
            Add stocks and mutual funds at your actual purchase price, and FDs, RDs, PPF or EPF with their interest rate. Returns and maturity values are worked out for you.
          </EmptyState>
        </div>
        {modals}
      </>
    )

  return (
    <>
      {head}
      <div className="stack">
        <div className="grid grid-4">
          <StatCard label="Total invested" value={inr(s.total_invested)} sub={`${s.count} active holdings`} />
          <StatCard label="Current value" value={inr(s.current_value)} />
          <StatCard label="Profit / loss" value={inr(s.absolute_pl, { sign: true })} tone={signClass(s.absolute_pl)} sub={Number(s.realized_pl) ? `Realised: ${inr(s.realized_pl, { sign: true })}` : 'Unrealised'} />
          <StatCard label="Returns" value={pct(s.return_pct, 2, { sign: true })} tone={signClass(s.absolute_pl)} sub="Absolute, on amount invested" />
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head"><h2>Allocation by investment type</h2></div>
            <div className="card-body">
              <div className="chart-box">
                <Doughnut
                  data={{
                    labels: s.by_type.map((t) => label(t.type)),
                    datasets: [{ data: s.by_type.map((t) => Number(t.current_value)), backgroundColor: colors.series, borderColor: colors.surface, borderWidth: 2 }],
                  }}
                  options={doughnutOptions(colors)}
                />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Asset class mix</h2></div>
            <div className="card-body">
              <div className="list">
                {s.by_asset_class.map((c, i) => (
                  <div key={c.asset_class} style={{ padding: '8px 0' }}>
                    <div className="row between" style={{ marginBottom: 5 }}>
                      <span className="row"><span className="dot" style={{ background: colors.series[i] }} />{CLASS_LABEL[c.asset_class]}</span>
                      <span className="num"><strong>{c.allocation_pct}%</strong> <span className="subtle">{inrShort(c.current_value)}</span></span>
                    </div>
                    <div className="progress"><div style={{ width: `${c.allocation_pct}%`, background: colors.series[i] }} /></div>
                  </div>
                ))}
              </div>
              {s.by_asset_class.some((c) => c.allocation_pct > 70) && (
                <div className="alert alert-warn" style={{ marginTop: 12 }}>
                  <Icon name="alert" />
                  Over 70% of your portfolio is in one asset class. Check this matches your risk tolerance and goals.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="filters">
            <div className="input-prefix search">
              <span><Icon name="search" size={15} /></span>
              <input className="input" style={{ width: '100%', paddingLeft: 32 }} placeholder="Search name, broker, symbol or folio" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search investments" />
            </div>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              {s.by_type.map((t) => <option key={t.type} value={t.type}>{label(t.type)}</option>)}
            </select>
            {closedCount > 0 && (
              <label className="check subtle">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ({closedCount})
              </label>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Investment</th>
                  <th className="r">Invested</th>
                  <th className="r">Current value</th>
                  <th className="r">Profit / loss</th>
                  <th className="r hide-mobile">Allocation</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const m = i.metrics
                  const alloc = Number(s.current_value) ? (Number(m.current_value) / Number(s.current_value)) * 100 : 0
                  return (
                    <tr key={i.id} style={{ cursor: 'pointer', opacity: i.is_closed ? 0.55 : 1 }} onClick={() => setDetail(i.id)}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{i.name}</div>
                        <div className="subtle">
                          {label(i.type)}
                          {i.institution && ` · ${i.institution}`}
                          {i.interest_rate && ` · ${Number(i.interest_rate)}%`}
                          {m.maturity_value && ` · matures ${fmtDate(i.maturity_date)}`}
                          {i.is_closed && ' · closed'}
                        </div>
                      </td>
                      <td className="r num">{inr(m.invested)}</td>
                      <td className="r num">
                        <div style={{ fontWeight: 600 }}>{inr(m.current_value)}</div>
                        <div className="subtle">{SOURCE_LABEL[m.value_source]}</div>
                      </td>
                      <td className={`r num ${signClass(m.unrealized_pl)}`}>
                        <div>{inr(m.unrealized_pl, { sign: true })}</div>
                        <div style={{ fontSize: 12 }}>{pct(m.return_pct, 2, { sign: true })}</div>
                      </td>
                      <td className="r num hide-mobile">{i.is_closed ? '—' : `${alloc.toFixed(1)}%`}</td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        {!i.is_closed && (
                          <button className="btn btn-sm" onClick={() => setQuickValue(i)} title={MARKET.includes(i.type) ? 'Update price / NAV' : 'Update value'}>
                            <Icon name="refresh" /> <span className="hide-mobile">Update</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {items.length === 0 && <EmptyState icon="search" title="No matching investments" />}
          </div>
        </div>
        <Disclaimer>
          Stocks, mutual funds, NPS and gold are valued at the latest price/NAV you enter. No fixed return is assumed for them. FD/RD/PPF/EPF values are calculated from the stated interest rate unless you enter a value. Past returns don't guarantee future returns.
        </Disclaimer>
      </div>
      {modals}
    </>
  )
}
