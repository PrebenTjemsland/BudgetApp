export default function Sheet({ open, title, onClose, children }) {
  return (
    <div
      className={`overlay${open ? ' open' : ''}`}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-hdr">
          <span>{title}</span>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
