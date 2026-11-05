import { useState } from 'react'
import { QuickInvestment } from './InvestmentForms'
import TransactionForm from './TransactionForm'
import { Modal } from './ui'

const TABS = [
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['transfer', 'Transfer'],
  ['investment', 'Investment'],
]

export default function QuickAdd({ onClose, initialTab = 'expense' }) {
  const [tab, setTab] = useState(initialTab)
  return (
    <Modal title="Quick add" onClose={onClose}>
      <div className="tabs" role="tablist">
        {TABS.map(([key, text]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            {text}
          </button>
        ))}
      </div>
      {tab === 'investment' ? (
        <QuickInvestment onDone={onClose} />
      ) : (
        <TransactionForm key={tab} defaultType={tab} hideTypeSwitch onDone={onClose} />
      )}
    </Modal>
  )
}
