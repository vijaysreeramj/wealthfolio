import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { isoDate, label } from '../lib/format'
import { useApi, useData } from '../hooks/data'
import { Field, MoneyInput, useSubmit } from './ui'

const TYPES = [
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['transfer', 'Transfer'],
]

/** Add or edit an income / expense / transfer. */
export default function TransactionForm({ initial, defaultType = 'expense', onDone, onCancel, hideTypeSwitch }) {
  const { bump, toast } = useData()
  const { data } = useApi(() => Promise.all([api.get('/accounts'), api.get('/categories')]), [])
  const [accounts, categories] = data || [[], []]

  const [form, setForm] = useState(() => ({
    type: initial?.type || defaultType,
    amount: initial?.amount ?? '',
    date: initial?.date || isoDate(),
    account_id: initial?.account_id ?? '',
    to_account_id: initial?.to_account_id ?? '',
    category_id: initial?.category_id ?? '',
    note: initial?.note ?? '',
  }))
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }))

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived || a.id === form.account_id || a.id === form.to_account_id),
    [accounts, form.account_id, form.to_account_id],
  )
  const cats = categories.filter((c) => c.kind === form.type && (!c.is_archived || c.id === form.category_id))
  const accountId = form.account_id || activeAccounts.find((a) => a.type === 'bank')?.id || activeAccounts[0]?.id || ''

  const { submit, busy, error } = useSubmit(async () => {
    const body = {
      type: form.type,
      amount: form.amount,
      date: form.date,
      account_id: Number(accountId),
      to_account_id: form.type === 'transfer' ? Number(form.to_account_id) || null : null,
      category_id: form.type !== 'transfer' ? Number(form.category_id) || null : null,
      note: form.note || null,
    }
    if (initial?.id) await api.put(`/transactions/${initial.id}`, body)
    else await api.post('/transactions', body)
    toast(initial?.id ? 'Transaction updated' : `${TYPES.find((t) => t[0] === form.type)[1]} added`)
    bump()
    onDone?.()
  })

  const accountLabel = form.type === 'income' ? 'Received in' : form.type === 'transfer' ? 'From account' : 'Paid from'

  return (
    <form className="form" onSubmit={submit}>
      {!hideTypeSwitch && (
        <div className="seg" role="group" aria-label="Transaction type" style={{ alignSelf: 'flex-start' }}>
          {TYPES.map(([value, text]) => (
            <button
              type="button"
              key={value}
              className={form.type === value ? 'on' : ''}
              onClick={() => setForm((f) => ({ ...f, type: value, category_id: '' }))}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      <div className="form-grid">
        <Field label="Amount">
          <MoneyInput value={form.amount} onChange={set('amount')} required autoFocus min="0.01" />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={form.date} onChange={set('date')} required />
        </Field>
        <Field label={accountLabel}>
          <select className="select" value={accountId} onChange={set('account_id')} required>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {label(a.type)}
              </option>
            ))}
          </select>
        </Field>
        {form.type === 'transfer' ? (
          <Field label="To account" hint="Card bill payments and moving money between accounts aren't counted as expenses.">
            <select className="select" value={form.to_account_id} onChange={set('to_account_id')} required>
              <option value="">Choose…</option>
              {activeAccounts
                .filter((a) => String(a.id) !== String(accountId))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {label(a.type)}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label="Category">
            <select className="select" value={form.category_id} onChange={set('category_id')} required>
              <option value="">Choose…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Note (optional)" full>
          <input className="input" value={form.note} onChange={set('note')} maxLength={255} placeholder="e.g. Swiggy dinner" />
        </Field>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : initial?.id ? 'Save changes' : 'Add'}
        </button>
      </div>
    </form>
  )
}
