export const COLORS = [
  '#4caf82', '#5b9cf6', '#e8f47d', '#f0a832', '#ff5c5c', '#c084fc',
  '#f472b6', '#34d399', '#fb923c', '#a3e635', '#67e8f9', '#fda4af'
]

function pad2(value) {
  return String(value).padStart(2, '0')
}

function normalizePayday(payday) {
  const parsed = Number.parseInt(String(payday ?? ''), 10)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : 1
}

function formatMonthValue(year, monthIndex) {
  return `${year}-${pad2(monthIndex + 1)}`
}

function parseMonthValue(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return null
  const [yearPart, monthPart] = month.split('-')
  const year = Number.parseInt(yearPart, 10)
  const monthIndex = Number.parseInt(monthPart, 10) - 1
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null
  return { year, monthIndex }
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatRangeDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmt(n, currency) {
  return currency + ' ' + Math.round(Math.abs(n)).toLocaleString('nb-NO')
}

export function today(date = new Date()) {
  return formatIsoDate(date)
}

export function getCurrentBudgetMonth(payday, now = new Date()) {
  const normalizedPayday = normalizePayday(payday)
  let year = now.getFullYear()
  let monthIndex = now.getMonth()
  const currentPeriodStartDay = Math.min(normalizedPayday, daysInMonth(year, monthIndex))

  if (now.getDate() < currentPeriodStartDay) {
    monthIndex -= 1
    if (monthIndex < 0) {
      monthIndex = 11
      year -= 1
    }
  }

  return formatMonthValue(year, monthIndex)
}

export function getBudgetMonthMeta(month, payday) {
  const parsed = parseMonthValue(month)
  if (!parsed) {
    return { value: month, label: month, shortLabel: month, rangeLabel: '' }
  }

  const normalizedPayday = normalizePayday(payday)
  const { year, monthIndex } = parsed
  const start = new Date(year, monthIndex, Math.min(normalizedPayday, daysInMonth(year, monthIndex)))
  const nextMonth = new Date(year, monthIndex + 1, 1)
  const endExclusive = new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    Math.min(normalizedPayday, daysInMonth(nextMonth.getFullYear(), nextMonth.getMonth()))
  )
  const end = new Date(endExclusive)
  end.setDate(end.getDate() - 1)

  return {
    value: formatMonthValue(year, monthIndex),
    label: new Date(year, monthIndex, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    shortLabel: new Date(year, monthIndex, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    rangeLabel: `${formatRangeDate(start)} – ${formatRangeDate(end)}`
  }
}

export function buildBudgetMonthOptions(payday, count = 18, now = new Date()) {
  const current = parseMonthValue(getCurrentBudgetMonth(payday, now))
  if (!current) return []

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current.year, current.monthIndex - index, 1)
    return getBudgetMonthMeta(formatMonthValue(date.getFullYear(), date.getMonth()), payday)
  })
}
