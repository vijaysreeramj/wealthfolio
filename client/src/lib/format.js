const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

/** ₹1,23,456 (Indian digit grouping). Pass {paise:true} for two decimals. */
export function inr(value, { paise = false, sign = false } = {}) {
  const n = Number(value ?? 0)
  const s = (paise ? inr2 : inr0).format(Math.abs(n))
  if (n < 0) return `−${s}`
  return sign && n > 0 ? `+${s}` : s
}

/** Compact: ₹4.2 K, ₹12.5 L, ₹3.2 Cr */
export function inrShort(value) {
  const n = Number(value ?? 0)
  const a = Math.abs(n)
  const neg = n < 0 ? '−' : ''
  const fmt = (v, unit) => `${neg}₹${v.toLocaleString('en-IN', { maximumFractionDigits: v < 10 ? 2 : 1 })} ${unit}`
  if (a >= 1e7) return fmt(a / 1e7, 'Cr')
  if (a >= 1e5) return fmt(a / 1e5, 'L')
  if (a >= 1e3) return fmt(a / 1e3, 'K')
  return inr(n)
}

export const fmtNum = (v) => num.format(Number(v ?? 0))

export function pct(value, digits = 1, { sign = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' })
const monthLong = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })

const parse = (d) => (typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00`) : d)
export const fmtDate = (d) => (d ? dateFmt.format(parse(d)) : '—')
export const fmtMonth = (d) => (d ? monthFmt.format(parse(d)) : '—')
export const fmtMonthLong = (d) => (d ? monthLong.format(parse(d)) : '—')

export function isoDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const signClass = (v) => (Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : '')

export const labels = {
  bank: 'Bank account',
  cash: 'Cash',
  credit_card: 'Credit card',
  loan: 'Loan',
  other_debt: 'Other debt',
  stock: 'Stocks',
  mutual_fund: 'Mutual fund',
  sip: 'SIP',
  fd: 'Fixed deposit',
  rd: 'Recurring deposit',
  ppf: 'PPF',
  epf: 'EPF',
  nps: 'NPS',
  gold: 'Gold',
  other: 'Other',
  property: 'Property',
  gold_physical: 'Physical gold',
  vehicle: 'Vehicle',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
  car: 'Car',
  vacation: 'Vacation',
  house: 'House',
  emergency_fund: 'Emergency fund',
  education: 'Education',
}
export const label = (key) => labels[key] ?? key
