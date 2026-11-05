import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import TransactionForm from '../components/TransactionForm'
import { EmptyState, ErrorBox, Modal, PageHead, PeriodPicker, StatCard } from '../components/ui'
import { useApi, useData } from '../hooks/data'
import { usePeriod } from '../hooks/period'
import { api } from '../lib/api'
import { fmtDate, inr } from '../lib/format'

const PAGE_SIZE = 50

export default function Transactions() {
  const period = usePeriod()
  const { bump, toast } = useData()
  const [filters, setFilters] = useState({ q: '', type: '', account_id: '', category_id: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // null | {} (new) | txn

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: search })), 300)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    setPage(1)
  }, [filters, period.start, period.end])

  const refs = useApi(() => Promise.all([api.get('/accounts'), api.get('/categories')]), [])
  const [accounts, categories] = refs.data || [[], []]
  const { data, error, loading, reload } = useApi(
    () => api.get('/transactions', { start: period.start, end: period.end, page, page_size: PAGE_SIZE, ...filters }),
    [period.start, period.end, page, filters],
  )

  const remove = async (t) => {
    if (!confirm(`Delete this ${t.type} of ${inr(t.amount, { paise: true })}?`)) return
    try {
      await api.del(`/transactions/${t.id}`)
      toast('Transaction deleted')
      bump()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const hasFilters = filters.q || filters.type || filters.account_id || filters.category_id
  const pages = data ? Math.max(1, Math.ceil(data.total_count / PAGE_SIZE)) : 1
  const net = data ? Number(data.total_income) - Number(data.total_expense) : 0

  return (
    <>
      <PageHead title="Transactions" subtitle="Every rupee in and out. Transfers between your accounts aren't counted as income or spending.">
        <PeriodPicker />
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Icon name="plus" /> Add transaction
        </button>
      </PageHead>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <StatCard label="Income" icon="down" value={inr(data?.total_income)} tone="pos" />
        <StatCard label="Expenses" icon="up" value={inr(data?.total_expense)} tone="neg" />
        <StatCard label="Net savings" value={inr(net)} tone={net >= 0 ? 'pos' : 'neg'} sub={hasFilters ? 'For the filtered transactions' : period.label} />
      </div>

      <div className="card">
        <div className="filters">
          <div className="input-prefix search">
            <span>
              <Icon name="search" size={15} />
            </span>
            <input
              className="input"
              placeholder="Search notes or categories"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search transactions"
              style={{ width: '100%', paddingLeft: 32 }}
            />
          </div>
          <select className="select" value={filters.type} onChange={setF('type')} aria-label="Type">
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </select>
          <select className="select" value={filters.account_id} onChange={setF('account_id')} aria-label="Account">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select className="select" value={filters.category_id} onChange={setF('category_id')} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind})
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setSearch('')
                setFilters({ q: '', type: '', account_id: '', category_id: '' })
              }}
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: 16 }}>
            <ErrorBox error={error} onRetry={reload} />
          </div>
        )}

        {data && data.items.length === 0 && !loading ? (
          hasFilters ? (
            <EmptyState icon="search" title="No matching transactions">
              Try a different search or clear the filters.
            </EmptyState>
          ) : (
            <EmptyState
              icon="transactions"
              title={`No transactions in ${period.label}`}
              action={
                <button className="btn btn-primary" onClick={() => setEditing({})}>
                  <Icon name="plus" /> Add your first transaction
                </button>
              }
            >
              Record your salary, daily spending and transfers. Your dashboard and budgets update automatically.
            </EmptyState>
          )
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Details</th>
                  <th className="hide-mobile">Account</th>
                  <th className="r">Amount</th>
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((t) => (
                  <tr key={t.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(t.date)}
                    </td>
                    <td>
                      <div className="row">
                        {t.type === 'transfer' ? (
                          <span className="badge badge-info">{t.is_linked ? 'Investment' : 'Transfer'}</span>
                        ) : (
                          <>
                            <span className="dot" style={{ background: t.category_color }} />
                            <span style={{ fontWeight: 550 }}>{t.category_name}</span>
                          </>
                        )}
                      </div>
                      <div className="subtle">
                        {t.type === 'transfer'
                          ? `${t.account_name || t.investment_name} → ${t.to_account_name || t.investment_name}`
                          : t.note}
                        {t.type === 'transfer' && t.note ? ` · ${t.note}` : ''}
                      </div>
                    </td>
                    <td className="hide-mobile muted">{t.account_name || t.to_account_name}</td>
                    <td className={`r num ${t.type === 'income' ? 'pos' : t.type === 'expense' ? '' : 'muted'}`} style={{ fontWeight: 600 }}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                      {inr(t.amount, { paise: true })}
                    </td>
                    <td className="actions">
                      {t.is_linked ? (
                        <span className="subtle" title="Edit this on the Investments page">
                          via Investments
                        </span>
                      ) : (
                        <>
                          <button className="icon-btn" onClick={() => setEditing(t)} aria-label="Edit">
                            <Icon name="edit" />
                          </button>
                          <button className="icon-btn" onClick={() => remove(t)} aria-label="Delete">
                            <Icon name="trash" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="row between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span className="subtle">
              Page {page} of {pages} · {data.total_count} transactions
            </span>
            <div className="row">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit transaction' : 'Add transaction'} onClose={() => setEditing(null)}>
          <TransactionForm initial={editing.id ? editing : undefined} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  )
}
