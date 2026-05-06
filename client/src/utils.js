export const COLORS = [
  '#4caf82', '#5b9cf6', '#e8f47d', '#f0a832', '#ff5c5c', '#c084fc',
  '#f472b6', '#34d399', '#fb923c', '#a3e635', '#67e8f9', '#fda4af'
]

export function fmt(n, currency) {
  return currency + ' ' + Math.round(Math.abs(n)).toLocaleString('nb-NO')
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}
