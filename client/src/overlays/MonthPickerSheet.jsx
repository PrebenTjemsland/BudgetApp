import { buildBudgetMonthOptions } from '../utils'
import Sheet from '../components/Sheet'

export default function MonthPickerSheet({ open, currentMonth, payday, onSelect, onClose }) {
  const months = buildBudgetMonthOptions(payday)

  return (
    <Sheet open={open} title="Budget month" onClose={onClose}>
      {months.map(({ value, label, rangeLabel }) => (
        <div key={value} className="month-row" onClick={() => onSelect(value)}>
          <div>
            <div>{label}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{rangeLabel}</div>
          </div>
          {value === currentMonth && <span className="check-mark">✓</span>}
        </div>
      ))}
    </Sheet>
  )
}
