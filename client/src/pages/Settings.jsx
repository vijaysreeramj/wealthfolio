import { useState } from 'react'
import Icon from '../components/Icon'
import { ErrorBox, Field, Modal, MoneyInput, PageHead, useSubmit } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useApi, useData } from '../hooks/data'
import { useTheme } from '../hooks/theme'
import { api } from '../lib/api'
import { inr, label } from '../lib/format'

const ACCOUNT_TYPES = ['bank', 'cash', 'credit_card', 'loan', 'other_debt']
const LIABILITY = ['credit_card', 'loan', 'other_debt']

function AccountForm({ initial, onDone }) {
  const { bump, toast } = useData()
  const [form, setForm] = useState({
    name: initial?.name || '',
    type: initial?.type || 'bank',
    institution: initial?.institution || '',
    opening_balance: initial?.opening_balance ?? '',
    is_archived: initial?.is_archived || false,
  })
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }))
  const isLiability = LIABILITY.includes(form.type)
  const { submit, busy, error } = useSubmit(async () => {
    const body = { ...form, opening_balance: form.opening_balance || 0, institution: form.institution || null }
    if (initial?.id) await api.put(`/accounts/${initial.id}`, body)
    else await api.post('/accounts', body)
    toast(initial?.id ? 'Account updated' : 'Account added')
    bump()
    onDone()
  })
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Account name">
          <input className="input" value={form.name} onChange={set('name')} required placeholder="e.g. HDFC Savings" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={form.type} onChange={set('type')}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bank / institution (optional)">
          <input className="input" value={form.institution} onChange={set('institution')} placeholder="e.g. HDFC Bank" />
        </Field>
        <Field
          label={isLiability ? 'Amount owed when added' : 'Opening balance'}
          hint={isLiability ? 'Outstanding today. New card spends and repayments update it.' : 'Balance before the transactions you record here.'}
        >
          <MoneyInput value={form.opening_balance} onChange={set('opening_balance')} />
        </Field>
        {initial?.id && (
          <label className="check full">
            <input type="checkbox" checked={form.is_archived} onChange={(e) => set('is_archived')(e.target.checked)} />
            Archived (hidden from forms, history kept)
          </label>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function CategoryForm({ initial, onDone }) {
  const { bump, toast } = useData()
  const [form, setForm] = useState({
    name: initial?.name || '',
    kind: initial?.kind || 'expense',
    color: initial?.color || '#0f766e',
    is_archived: initial?.is_archived || false,
  })
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }))
  const { submit, busy, error } = useSubmit(async () => {
    if (initial?.id) await api.put(`/categories/${initial.id}`, form)
    else await api.post('/categories', form)
    toast(initial?.id ? 'Category updated' : 'Category added')
    bump()
    onDone()
  })
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={form.name} onChange={set('name')} required maxLength={60} autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={form.kind} onChange={set('kind')}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </Field>
        <Field label="Colour">
          <input className="input" type="color" value={form.color} onChange={set('color')} style={{ padding: 4 }} />
        </Field>
        {initial?.id && (
          <label className="check" style={{ alignSelf: 'end', height: 38 }}>
            <input type="checkbox" checked={form.is_archived} onChange={(e) => set('is_archived')(e.target.checked)} />
            Archived
          </label>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default function Settings() {
  const { user, updateProfile } = useAuth()
  const { mode, setMode } = useTheme()
  const { bump, toast } = useData()
  const [name, setName] = useState(user.name)
  const [modal, setModal] = useState(null)
  const accounts = useApi(() => api.get('/accounts'), [])
  const categories = useApi(() => api.get('/categories'), [])

  const saveName = async (e) => {
    e.preventDefault()
    await updateProfile({ name })
    toast('Profile saved')
  }

  const remove = async (path, what) => {
    if (!confirm(`Delete ${what}?`)) return
    try {
      await api.del(path)
      toast(`${what} deleted`)
      bump()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <>
      <PageHead title="Settings" subtitle="Your profile, appearance, accounts and categories." />
      <div className="stack">
        <div className="grid grid-2">
          <div className="card card-pad">
            <h2 style={{ marginBottom: 14 }}>Profile</h2>
            <form className="form" onSubmit={saveName}>
              <Field label="Name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Email">
                <input className="input" value={user.email} disabled />
              </Field>
              <div className="form-actions">
                <button className="btn btn-primary" disabled={name === user.name}>
                  Save
                </button>
              </div>
            </form>
          </div>
          <div className="card card-pad">
            <h2 style={{ marginBottom: 6 }}>Appearance</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              System follows your device setting. Your choice is saved to your account.
            </p>
            <div className="seg" role="radiogroup" aria-label="Theme">
              {['light', 'dark', 'system'].map((t) => (
                <button key={t} role="radio" aria-checked={mode === t} className={mode === t ? 'on' : ''} onClick={() => setMode(t)}>
                  <Icon name={t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'monitor'} />
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <p className="subtle" style={{ marginTop: 16 }}>
              Currency: Indian Rupee (₹), with lakh/crore digit grouping.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Accounts</h2>
              <p className="subtle">Bank accounts and cash are assets. Credit cards, loans and debts are liabilities.</p>
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => setModal({ kind: 'account' })}>
              <Icon name="plus" /> Add account
            </button>
          </div>
          <div className="card-body">
            <ErrorBox error={accounts.error} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th className="r">Balance</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {accounts.data?.map((a) => (
                    <tr key={a.id} style={a.is_archived ? { opacity: 0.55 } : undefined}>
                      <td>
                        <div style={{ fontWeight: 550 }}>{a.name}</div>
                        {a.institution && <div className="subtle">{a.institution}</div>}
                      </td>
                      <td>
                        <span className={`badge ${a.is_liability ? 'badge-neg' : ''}`}>{label(a.type)}</span>
                        {a.is_archived && <span className="badge" style={{ marginLeft: 6 }}>Archived</span>}
                      </td>
                      <td className="r num" style={{ fontWeight: 600 }}>
                        {a.is_liability ? `${inr(a.balance, { paise: true })} owed` : inr(a.balance, { paise: true })}
                      </td>
                      <td className="actions">
                        <button className="icon-btn" onClick={() => setModal({ kind: 'account', item: a })} aria-label="Edit">
                          <Icon name="edit" />
                        </button>
                        <button className="icon-btn" onClick={() => remove(`/accounts/${a.id}`, `account "${a.name}"`)} aria-label="Delete">
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Categories</h2>
              <p className="subtle">Used for transactions and budgets.</p>
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => setModal({ kind: 'category' })}>
              <Icon name="plus" /> Add category
            </button>
          </div>
          <div className="card-body grid grid-2">
            {['expense', 'income'].map((kind) => (
              <div key={kind}>
                <h3 className="muted" style={{ marginBottom: 6 }}>
                  {kind === 'expense' ? 'Expense categories' : 'Income categories'}
                </h3>
                <div className="list">
                  {categories.data
                    ?.filter((c) => c.kind === kind)
                    .map((c) => (
                      <div className="list-item" key={c.id} style={c.is_archived ? { opacity: 0.55 } : undefined}>
                        <span className="dot" style={{ background: c.color }} />
                        <span className="grow">
                          {c.name}
                          {c.is_archived && <span className="subtle"> · archived</span>}
                        </span>
                        <button className="icon-btn" onClick={() => setModal({ kind: 'category', item: c })} aria-label={`Edit ${c.name}`}>
                          <Icon name="edit" />
                        </button>
                        <button className="icon-btn" onClick={() => remove(`/categories/${c.id}`, `category "${c.name}"`)} aria-label={`Delete ${c.name}`}>
                          <Icon name="trash" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal?.kind === 'account' && (
        <Modal title={modal.item ? 'Edit account' : 'Add account'} onClose={() => setModal(null)}>
          <AccountForm initial={modal.item} onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal?.kind === 'category' && (
        <Modal title={modal.item ? 'Edit category' : 'Add category'} onClose={() => setModal(null)}>
          <CategoryForm initial={modal.item} onDone={() => setModal(null)} />
        </Modal>
      )}
    </>
  )
}
