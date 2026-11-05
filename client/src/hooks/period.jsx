import { createContext, useContext, useMemo, useState } from 'react'
import { fmtMonthLong, isoDate } from '../lib/format'

const PeriodContext = createContext(null)

/** Shared month/year filter used by the dashboard, transactions and budgets. */
export function PeriodProvider({ children }) {
  const today = new Date()
  const [mode, setMode] = useState('month')
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))

  const value = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const start = mode === 'month' ? new Date(y, m, 1) : new Date(y, 0, 1)
    const end = mode === 'month' ? new Date(y, m + 1, 0) : new Date(y, 11, 31)
    const step = (dir) =>
      setCursor(mode === 'month' ? new Date(y, m + dir, 1) : new Date(y + dir, m, 1))
    const isCurrent =
      mode === 'month' ? y === today.getFullYear() && m === today.getMonth() : y === today.getFullYear()
    return {
      mode,
      setMode,
      start: isoDate(start),
      end: isoDate(end),
      month: isoDate(new Date(y, m, 1)),
      year: y,
      label: mode === 'month' ? fmtMonthLong(start) : `${y}`,
      prev: () => step(-1),
      next: () => step(1),
      reset: () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1)),
      isCurrent,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cursor])

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

export const usePeriod = () => useContext(PeriodContext)
