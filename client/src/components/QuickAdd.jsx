import { useState } from 'react'
import { Modal } from './ui'
import TransactionForm from './TransactionForm'

// Extra quick-add tabs (e.g. investments) register here as features are added.
export const extraQuickAddTabs = []

export default function QuickAdd({ onClose, initialTab = 'expense' }) {
  const [tab, setTab] = useState(initialTab)
  const tabs = [
    ['expense', 'Expense'],
    ['income', 'Income'],
    ['transfer', 'Transfer'],
    ...extraQuickAddTabs.map((t) => [t.key, t.label]),
  ]
  const extra = extraQuickAddTabs.find((t) => t.key === tab)
  return (
    <Modal title="Quick add" onClose={onClose}>
      <div className="tabs" role="tablist">
        {tabs.map(([key, text]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            {text}
          </button>
        ))}
      </div>
      {extra ? (
        <extra.Component onDone={onClose} />
      ) : (
        <TransactionForm key={tab} defaultType={tab} hideTypeSwitch onDone={onClose} />
      )}
    </Modal>
  )
}
