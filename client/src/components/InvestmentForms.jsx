import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { inr, isoDate, label } from '../lib/format'
import { useApi, useData } from '../hooks/data'
import { Field, MoneyInput, useSubmit } from './ui'

export const INVESTMENT_TYPES = ['stock', 'mutual_fund', 'sip', 'fd', 'rd', 'ppf', 'epf', 'nps', 'gold', 'other']
export const MARKET = ['stock', 'mutual_fund', 'sip', 'nps', 'gold']
const RATE_DEFAULTS = { ppf: '7.1', epf: '8.25' }
const UNIT_LABEL = { stock: 'Shares', gold: 'Grams / units', default: 'Units' }
const PRICE_LABEL = { stock: 'Price per share', gold: 'Price per gram/unit', default: 'NAV per unit' }

export const txnTypesFor = (type) =>
  MARKET.includes(type)
    ? ['buy', 'sell', 'dividend']
    : type === 'other'
      ? ['buy', 'sell', 'deposit', 'withdrawal', 'interest', 'dividend']
      : ['deposit', 'withdrawal', 'interest']

const TXN_LABEL = { buy: 'Buy', sell: 'Sell', dividend: 'Dividend', deposit: 'Deposit', withdrawal: 'Withdrawal', interest: 'Interest paid out' }
export const txnLabel = (t) => TXN_LABEL[t] ?? t

function useAccounts() {
  const { data } = useApi(() => api.get('/accounts'), [])
  return (data || []).filter((a) => !a.is_archived && !a.is_liability)
}

function AccountSelect({ value, onChange, txnType }) {
  const accounts = useAccounts()
  const outflow = ['buy', 'deposit'].includes(txnType)
  return (
    <Field
      label={outflow ? 'Paid from (optional)' : 'Credited to (optional)'}
      hint={outflow ? 'Deducts it from that account without counting it as an expense.' : 'Adds the money to that account.'}
    >
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Don't link to an account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** Fields for one investment entry (buy/sell/deposit...). */
function TxnFields({ invType, form, set, showType = true }) {
  const market = MARKET.includes(invType)
  const unitsNeeded = market && ['buy', 'sell'].includes(form.type)
  const computed = unitsNeeded && form.units && form.price ? Number(form.units) * Number(form.price) : null
  return (
    <>
      {showType && (
        <Field label="Entry type">
          <select className="select" value={form.type} onChange={set('type')}>
            {txnTypesFor(invType).map((t) => (
              <option key={t} value={t}>
                {txnLabel(t)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Date">
        <input className="input" type="date" value={form.date} onChange={set('date')} required />
      </Field>
      {unitsNeeded ? (
        <>
          <Field label={UNIT_LABEL[invType] || UNIT_LABEL.default}>
            <input className="input num" type="number" step="any" min="0" value={form.units} onChange={set('units')} required />
          </Field>
          <Field label={PRICE_LABEL[invType] || PRICE_LABEL.default}>
            <MoneyInput value={form.price} onChange={set('price')} step="any" required />
          </Field>
          <Field label="Total amount" hint={computed !== null ? `Units × price = ${inr(computed, { paise: true })}. Change it to include charges.` : 'Filled from units × price.'}>
            <MoneyInput value={form.amount} onChange={set('amount')} placeholder={computed !== null ? computed.toFixed(2) : ''} />
          </Field>
        </>
      ) : (
        <Field label="Amount">
          <MoneyInput value={form.amount} onChange={set('amount')} required min="0.01" />
        </Field>
      )}
    </>
  )
}

const emptyTxn = (type) => ({ type, date: isoDate(), units: '', price: '', amount: '', account_id: '', note: '' })

function txnBody(form) {
  return {
    type: form.type,
    date: form.date,
    units: form.units || null,
    price: form.price || null,
    amount: form.amount || null,
    account_id: form.account_id ? Number(form.account_id) : null,
    note: form.note || null,
  }
}

/** Create or edit an investment. New ones include the first purchase/deposit. */
export function InvestmentForm({ initial, onDone }) {
  const { bump, toast } = useData()
  const isNew = !initial?.id
  const [f, setF] = useState(() => ({
    name: initial?.name || '',
    type: initial?.type || 'mutual_fund',
    folio_number: initial?.folio_number || '',
    institution: initial?.institution || '',
    symbol: initial?.symbol || '',
    current_price: initial?.current_price ?? '',
    manual_current_value: initial?.manual_current_value ?? '',
    interest_rate: initial?.interest_rate ?? '',
    compounding: initial?.compounding || 'quarterly',
    start_date: initial?.start_date || isoDate(),
    maturity_date: initial?.maturity_date || '',
    installment_amount: initial?.installment_amount ?? '',
    notes: initial?.notes || '',
    is_closed: initial?.is_closed || false,
  }))
  const [t, setT] = useState(() => emptyTxn('buy'))
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }))
  const setTx = (k) => (v) => setT((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))

  const market = MARKET.includes(f.type)
  const fixed = ['fd', 'rd', 'ppf', 'epf'].includes(f.type)
  const initialType = market ? 'buy' : f.type === 'other' ? 'buy' : 'deposit'

  const changeType = (e) => {
    const type = e.target.value
    setF((s) => ({
      ...s,
      type,
      interest_rate: RATE_DEFAULTS[type] ?? s.interest_rate,
      compounding: ['ppf', 'epf'].includes(type) ? 'yearly' : ['fd', 'rd'].includes(type) ? 'quarterly' : s.compounding,
    }))
  }

  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      ...f,
      folio_number: f.folio_number || null,
      institution: f.institution || null,
      symbol: f.symbol || null,
      current_price: market && f.current_price !== '' ? f.current_price : null,
      manual_current_value: f.manual_current_value !== '' ? f.manual_current_value : null,
      interest_rate: fixed && f.interest_rate !== '' ? f.interest_rate : null,
      compounding: fixed ? f.compounding : null,
      start_date: f.start_date || null,
      maturity_date: f.maturity_date || null,
      installment_amount: f.installment_amount || null,
      notes: f.notes || null,
    }
    let result
    if (isNew) {
      const skipInitial = f.type === 'rd' || (!t.amount && !t.units)
      result = await api.post('/investments', {
        ...body,
        initial: skipInitial ? null : txnBody({ ...t, type: initialType, date: t.date || f.start_date }),
      })
    } else {
      result = await api.put(`/investments/${initial.id}`, body)
    }
    toast(isNew ? 'Investment added' : 'Investment updated')
    bump()
    onDone?.(result)
  })

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Investment name" full>
          <input className="input" value={f.name} onChange={set('name')} required placeholder="e.g. Parag Parikh Flexi Cap, SBI FD, Infosys" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={f.type} onChange={changeType}>
            {INVESTMENT_TYPES.map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Broker / institution">
          <input className="input" value={f.institution} onChange={set('institution')} placeholder="e.g. Zerodha, HDFC Bank, CAMS" />
        </Field>
        <Field label="Folio / account number (optional)">
          <input className="input" value={f.folio_number} onChange={set('folio_number')} />
        </Field>
        {market && (
          <Field label="Symbol / scheme code (optional)">
            <input className="input" value={f.symbol} onChange={set('symbol')} placeholder="e.g. INFY" />
          </Field>
        )}

        {market && (
          <Field label={`Current ${f.type === 'stock' ? 'price' : f.type === 'gold' ? 'price per gram/unit' : 'NAV'}`} hint="Value = units held × this. Update it any time.">
            <MoneyInput value={f.current_price} onChange={set('current_price')} step="any" />
          </Field>
        )}
        {f.type === 'sip' && (
          <Field label="Monthly SIP amount">
            <MoneyInput value={f.installment_amount} onChange={set('installment_amount')} />
          </Field>
        )}

        {fixed && (
          <>
            <Field label="Interest rate (% p.a.)">
              <input className="input num" type="number" step="0.01" min="0" max="50" value={f.interest_rate} onChange={set('interest_rate')} required={['fd', 'rd'].includes(f.type)} />
            </Field>
            <Field label="Compounding">
              <select className="select" value={f.compounding} onChange={set('compounding')}>
                {['monthly', 'quarterly', 'half_yearly', 'yearly'].map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={f.type === 'rd' ? 'First instalment date' : 'Start date'}>
              <input className="input" type="date" value={f.start_date} onChange={set('start_date')} />
            </Field>
            <Field label={`Maturity date${['ppf', 'epf'].includes(f.type) ? ' (optional)' : ''}`}>
              <input className="input" type="date" value={f.maturity_date} onChange={set('maturity_date')} required={['fd', 'rd'].includes(f.type)} />
            </Field>
            {f.type === 'rd' && (
              <Field label="Monthly instalment" hint="Instalments are assumed paid each month unless you record deposits.">
                <MoneyInput value={f.installment_amount} onChange={set('installment_amount')} required />
              </Field>
            )}
          </>
        )}

        {isNew && f.type !== 'rd' && (
          <>
            <div className="full" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <h3>{market ? 'Purchase' : 'Amount invested'}</h3>
              <p className="subtle">
                {market
                  ? 'Your actual purchase price. Add more buys or SIP instalments later from the investment details.'
                  : 'The amount you put in. Add more deposits later.'}
              </p>
            </div>
            <TxnFields invType={f.type} form={{ ...t, type: initialType }} set={setTx} showType={false} />
            <AccountSelect value={t.account_id} onChange={setTx('account_id')} txnType={initialType} />
          </>
        )}

        {!market && (
          <Field
            label="Current value (optional)"
            hint={fixed ? 'Leave blank to calculate it from the interest rate. Enter a value to override (e.g. from your passbook).' : 'Leave blank to use the amount invested.'}
          >
            <MoneyInput value={f.manual_current_value} onChange={set('manual_current_value')} />
          </Field>
        )}

        <Field label="Notes (optional)" full>
          <textarea className="textarea" value={f.notes} onChange={set('notes')} rows={2} />
        </Field>
        {!isNew && (
          <label className="check full">
            <input type="checkbox" checked={f.is_closed} onChange={set('is_closed')} />
            Closed / fully redeemed (kept for history, excluded from totals)
          </label>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Add investment' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

/** Add or edit a single entry (buy, sell, deposit...) on an investment. */
export function TxnForm({ investment, initial, onDone }) {
  const { bump, toast } = useData()
  const types = txnTypesFor(investment.type)
  const [form, setForm] = useState(() =>
    initial
      ? { ...initial, units: initial.units ?? '', price: initial.price ?? '', amount: initial.amount ?? '', account_id: initial.account_id ?? '', note: initial.note ?? '' }
      : {
          ...emptyTxn(types[0]),
          amount: investment.type === 'sip' && investment.installment_amount ? investment.installment_amount : '',
          price: MARKET.includes(investment.type) && investment.current_price ? investment.current_price : '',
        },
  )
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v?.target ? v.target.value : v }))
  const { submit, busy, error } = useSubmit(async () => {
    const body = txnBody(form)
    const r = initial
      ? await api.put(`/investments/${investment.id}/txns/${initial.id}`, body)
      : await api.post(`/investments/${investment.id}/txns`, body)
    toast(initial ? 'Entry updated' : 'Entry added')
    bump()
    onDone?.(r)
  })
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <TxnFields invType={investment.type} form={form} set={set} />
        <AccountSelect value={form.account_id} onChange={set('account_id')} txnType={form.type} />
        <Field label="Note (optional)" full>
          <input className="input" value={form.note} onChange={set('note')} maxLength={255} />
        </Field>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save entry' : 'Add entry'}
        </button>
      </div>
    </form>
  )
}

/** Quick update of price/NAV (market) or current value (others). */
export function ValueForm({ investment, onDone }) {
  const { bump, toast } = useData()
  const market = MARKET.includes(investment.type)
  const [value, setValue] = useState(market ? investment.current_price ?? '' : investment.manual_current_value ?? '')
  const [asOf, setAsOf] = useState(isoDate())
  const { submit, busy, error } = useSubmit(async () => {
    const body = market
      ? { current_price: value === '' ? null : value, as_of: asOf }
      : { manual_current_value: value === '' ? null : value, as_of: asOf }
    const r = await api.patch(`/investments/${investment.id}/value`, body)
    toast('Value updated')
    bump()
    onDone?.(r)
  })
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field
          label={market ? (investment.type === 'stock' ? 'Latest share price' : 'Latest NAV / price') : 'Current value'}
          hint={market ? `${investment.metrics.units ?? 0} units held` : 'Leave blank to go back to the calculated value.'}
        >
          <MoneyInput value={value} onChange={setValue} step="any" autoFocus />
        </Field>
        <Field label="As of">
          <input className="input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
      </div>
      {market && value !== '' && investment.metrics.units && (
        <p className="muted">New value: {inr(Number(value) * Number(investment.metrics.units))}</p>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Update'}
        </button>
      </div>
    </form>
  )
}

/** Quick-add tab: add an entry to an existing investment, or start a new one. */
export function QuickInvestment({ onDone }) {
  const navigate = useNavigate()
  const { data } = useApi(() => api.get('/investments'), [])
  const [id, setId] = useState('')
  const items = (data?.items || []).filter((i) => !i.is_closed)
  const selected = items.find((i) => String(i.id) === String(id))
  const goNew = () => {
    onDone?.()
    navigate('/investments?new=1')
  }
  if (data && items.length === 0)
    return (
      <div className="empty">
        <p>You haven't added any investments yet.</p>
        <button className="btn btn-primary" onClick={goNew}>
          Add your first investment
        </button>
      </div>
    )
  return (
    <div className="form">
      <Field label="Investment">
        <select className="select" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {label(i.type)}
            </option>
          ))}
        </select>
      </Field>
      {selected && <TxnForm key={selected.id} investment={selected} onDone={onDone} />}
      <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={goNew}>
        + New investment instead
      </button>
    </div>
  )
}
