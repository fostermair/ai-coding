/** Format integer cents as Euro string: 559 → "5,59", -3829 → "-38,29" */
export function formatEuro(cents: number): string {
  const abs = Math.abs(cents)
  const euro = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, "0")
  return `${cents < 0 ? "-" : ""}${euro},${rest}`
}

/** Format ISO date "2025-12-29" → "29.12.2025" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}
