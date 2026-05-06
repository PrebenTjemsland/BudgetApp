import Sheet from '../components/Sheet'

export default function MonthPickerSheet({ open, currentMonth, onSelect, onClose }) {
  const months = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)
    return {
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    }
  })

  return (
    <Sheet open={open} title="Month" onClose={onClose}>
      {months.map(({ value, label }) => (
        <div key={value} className="month-row" onClick={() => onSelect(value)}>
          <span>{label}</span>
          {value === currentMonth && <span className="check-mark">✓</span>}
        </div>
      ))}
    </Sheet>
  )
}
