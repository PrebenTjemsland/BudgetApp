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

function isoDateToDayNumber(dateString) {
  const [yearPart, monthPart, dayPart] = String(dateString || '').split('-')
  const year = Number.parseInt(yearPart, 10)
  const month = Number.parseInt(monthPart, 10)
  const day = Number.parseInt(dayPart, 10)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const PACE_STYLES = {
  muted: { color: 'var(--muted)', label: 'Not started' },
  green: { color: 'var(--green)', label: 'On pace' },
  amber: { color: 'var(--amber)', label: 'A bit ahead of pace' },
  orange: { color: 'var(--orange)', label: 'Well ahead of pace' },
  red: { color: 'var(--red)', label: 'Over budget' }
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
    return { value: month, label: month, shortLabel: month, rangeLabel: '', startDate: null, endDate: null, dayCount: 0 }
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
    rangeLabel: `${formatRangeDate(start)} – ${formatRangeDate(end)}`,
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end),
    dayCount: ((isoDateToDayNumber(formatIsoDate(end)) ?? 0) - (isoDateToDayNumber(formatIsoDate(start)) ?? 0)) + 1
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

export function compareBudgetMonths(leftMonth, rightMonth) {
  const left = parseMonthValue(leftMonth)
  const right = parseMonthValue(rightMonth)
  if (!left || !right) return 0
  return (left.year - right.year) * 12 + (left.monthIndex - right.monthIndex)
}

export function getBudgetPaceStatus({ month, payday, spent = 0, budget = 0, now = new Date() }) {
  const currentMonth = getCurrentBudgetMonth(payday, now)
  const relationDelta = compareBudgetMonths(month, currentMonth)
  const relation = relationDelta < 0 ? 'past' : relationDelta > 0 ? 'future' : 'current'
  const budgetAmount = Number.isFinite(budget) ? budget : 0
  const spentAmount = Number.isFinite(spent) ? spent : 0
  const spentRatio = budgetAmount > 0 ? spentAmount / budgetAmount : (spentAmount > 0 ? Infinity : 0)

  if (budgetAmount <= 0) {
    const severity = spentAmount > 0 ? 'red' : 'muted'
    return { relation, severity, spentRatio, elapsedRatio: 0, ...PACE_STYLES[severity], label: spentAmount > 0 ? 'No budget set' : 'No activity yet' }
  }

  if (relation === 'past') {
    const severity = spentRatio <= 1 ? 'green' : spentRatio <= 1.1 ? 'orange' : 'red'
    const label = severity === 'green' ? 'Finished under budget' : severity === 'orange' ? 'Slightly over budget' : 'Over budget'
    return { relation, severity, spentRatio, elapsedRatio: 1, ...PACE_STYLES[severity], label }
  }

  if (relation === 'future') {
    const severity = spentRatio === 0 ? 'muted' : spentRatio < 1 ? 'amber' : 'red'
    const label = severity === 'muted' ? 'Not started' : severity === 'amber' ? 'Spend already booked' : 'Over budget'
    return { relation, severity, spentRatio, elapsedRatio: 0, ...PACE_STYLES[severity], label }
  }

  const meta = getBudgetMonthMeta(month, payday)
  const currentDayNumber = isoDateToDayNumber(today(now))
  const startDayNumber = isoDateToDayNumber(meta.startDate)
  const elapsedDays = currentDayNumber != null && startDayNumber != null
    ? clamp(currentDayNumber - startDayNumber + 1, 0, Math.max(meta.dayCount, 1))
    : 0
  const elapsedRatio = meta.dayCount > 0 ? elapsedDays / meta.dayCount : 0
  const paceDelta = spentRatio - elapsedRatio

  let severity = 'green'
  if (spentRatio >= 1 || paceDelta > 0.30) severity = 'red'
  else if (paceDelta > 0.15) severity = 'orange'
  else if (paceDelta > 0.05) severity = 'amber'

  const label = severity === 'green'
    ? 'On pace'
    : severity === 'amber'
      ? 'A bit ahead of pace'
      : severity === 'orange'
        ? 'Well ahead of pace'
        : spentRatio >= 1
          ? 'Over budget'
          : 'Far ahead of pace'

  return { relation, severity, spentRatio, elapsedRatio, paceDelta, ...PACE_STYLES[severity], label }
}
