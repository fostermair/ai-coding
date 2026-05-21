export interface ParsedDiscount {
  description: string
  amountCents: number
  taxCode: string
}

export interface ParsedItem {
  rawName: string
  itemType: "product" | "pfand" | "leergut" | "concession"
  quantity: number
  unitPriceCents: number
  totalPriceCents: number
  taxCode: string
  bonusExcluded: boolean
  concessionaireCode: string | null
  position: number
  discounts: ParsedDiscount[]
}

export interface ParsedReceipt {
  storeName: string
  storeAddress: string
  storeUid: string
  marketNr: string
  receiptNr: string
  receiptDate: string // YYYY-MM-DD
  receiptTime: string // HH:MM
  paymentMethod: string
  totalAmountCents: number
  items: ParsedItem[]
  storeChain: "rewe" | "lidl" | "kaufland"
}

// "5,59" → 559  |  "-2,80" → -280
function parseCents(s: string): number {
  return Math.round(parseFloat(s.replace(",", ".")) * 100)
}

// "29.12.2025" → "2025-12-29"
function toIsoDate(s: string): string {
  const [d, m, y] = s.split(".")
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
}

// "2025-12-29" → "29.12.2025"
export function formatGermanDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

export function parseReweEbon(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trimEnd())

  // Find section boundaries
  // "EUR" alone on a line marks start of items (column header)
  const eurIdx = lines.findIndex((l) => l.trim() === "EUR")
  // "SUMME EUR" marks end of items
  const summeIdx = lines.findIndex((l) => /SUMME\s+EUR/.test(l))

  if (eurIdx === -1 || summeIdx === -1) {
    throw new Error("Format nicht erkannt: Kein REWE eBon")
  }

  const storeName = extractStoreName(lines.slice(0, eurIdx))
  const storeAddress = extractStoreAddress(lines.slice(0, eurIdx))
  const storeUid = extractStoreUid(lines.slice(0, eurIdx))

  const items = parseItemLines(lines.slice(eurIdx + 1, summeIdx))

  const footerText = lines.slice(summeIdx).join("\n")
  const { receiptDate, receiptTime, receiptNr, marketNr, paymentMethod, totalAmountCents } =
    parseFooter(footerText)

  return {
    storeName,
    storeAddress,
    storeUid,
    marketNr,
    receiptNr,
    receiptDate,
    receiptTime,
    paymentMethod,
    totalAmountCents,
    items,
    storeChain: "rewe",
  }
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

function isDecorativeLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^\*+$/.test(t)) return true         // ****
  if (/^-+$/.test(t)) return true          // ----
  if (/^={3,}$/.test(t)) return true       // ====
  if (/^\*\s.+\s\*$/.test(t)) return true  // * Text *
  if (/Heimatshopping/i.test(t)) return true
  if (/UID\s+Nr/i.test(t)) return true
  if (/^\d{5}[/\s]\d{4,}/.test(t)) return true  // phone: 05254/957970
  if (/^www\./i.test(t)) return true
  return false
}

function extractStoreName(headerLines: string[]): string {
  // Prefer a line that contains "Rewe" (case-insensitive)
  const reweLine = headerLines
    .map((l) => l.trim())
    .filter((l) => !isDecorativeLine(l) && /rewe/i.test(l))
  if (reweLine.length > 0) return reweLine[0]

  // Fallback: first non-decorative text line
  const fallback = headerLines.map((l) => l.trim()).filter((l) => !isDecorativeLine(l))
  return fallback[0] ?? ""
}

function extractStoreAddress(headerLines: string[]): string {
  const textLines = headerLines
    .map((l) => l.trim())
    .filter((l) => !isDecorativeLine(l) && !/rewe/i.test(l))
  // Usually: street + city (2 lines), optionally a phone number we already filter
  return textLines.slice(0, 3).join(", ")
}

function extractStoreUid(headerLines: string[]): string {
  for (const line of headerLines) {
    const m = line.match(/UID\s+Nr\.?\s*:\s*(\S+)/i)
    if (m) return m[1]
  }
  return ""
}

// ---------------------------------------------------------------------------
// Item line parser
// ---------------------------------------------------------------------------

function parseItemLines(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = []
  let position = 0
  let pendingName: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^[-=]+$/.test(trimmed)) continue

    const isIndented = line.startsWith(" ") || line.startsWith("\t")

    // ── Continuation lines (indented) ──────────────────────────────────────
    if (isIndented && items.length > 0) {
      const last = items[items.length - 1]

      // Quantity: "2 Stk x 1,79"
      const qtyM = trimmed.match(/^(\d+)\s+Stk\s+x\s+(\d+,\d{2})$/)
      if (qtyM) {
        last.quantity = parseInt(qtyM[1], 10)
        last.unitPriceCents = parseCents(qtyM[2])
        continue
      }

      // Discount: "Weihn. Sueßwaren 50% -2,80 B"
      const discM = trimmed.match(/^(.+?)\s+(-\d+,\d{2})\s+([AB])(\s+\*)?$/)
      if (discM) {
        last.discounts.push({
          description: discM[1].trim(),
          amountCents: parseCents(discM[2]),
          taxCode: discM[3],
        })
        continue
      }
    }

    // ── PFAND: "PFAND 3,30 EUR 3,30 A *" ───────────────────────────────────
    const pfandM = trimmed.match(
      /^PFAND\s+\d+,\d{2}\s+EUR\s+(-?\d+,\d{2})\s+([AB])\s*(\*)?$/
    )
    if (pfandM) {
      pendingName = null
      const cents = parseCents(pfandM[1])
      items.push({
        rawName: "PFAND",
        itemType: "pfand",
        quantity: 1,
        unitPriceCents: cents,
        totalPriceCents: cents,
        taxCode: pfandM[2],
        bonusExcluded: !!pfandM[3],
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      continue
    }

    // ── Standard product line: "NAME [X01] PRICE TAX [*]" ──────────────────
    // Non-greedy name match; \s+ handles both single-space (test fixtures) and
    // multi-space (real PDF alignment); the regex engine backtracks until the
    // decimal+taxCode suffix matches correctly.
    const prodM = trimmed.match(/^(.+?)\s+(-?\d+,\d{2})\s+([AB])\s*(\*)?$/)
    if (prodM) {
      let rawName = prodM[1].trim()

      // If rawName is purely numeric and we have a pending name from the previous line,
      // use the pending name instead (handles PDF layout where product name and price
      // appear on separate lines, with a numeric placeholder on the price line)
      if (/^\d+$/.test(rawName) && pendingName) {
        rawName = pendingName
      }
      pendingName = null

      const totalCents = parseCents(prodM[2])
      const taxCode = prodM[3]
      const bonusExcluded = !!prodM[4]
      let concCode: string | null = null
      let itemType: ParsedItem["itemType"] = "product"

      // Concession code at end of name: "FRISCHFLEISCH X01"
      const concM = rawName.match(/^(.+?)\s+(X\d{2,3})$/)
      if (concM) {
        rawName = concM[1].trim()
        concCode = concM[2]
        itemType = "concession"
      }

      // Determine type from name prefix
      if (rawName.startsWith("LEERG.") || rawName.startsWith("LEERGUT")) {
        itemType = "leergut"
      } else if (rawName.startsWith("TRANSPORTBOX")) {
        itemType = "pfand"
      }

      items.push({
        rawName,
        itemType,
        quantity: 1,
        unitPriceCents: totalCents, // updated by qty line if present
        totalPriceCents: totalCents,
        taxCode,
        bonusExcluded,
        concessionaireCode: concCode,
        position: position++,
        discounts: [],
      })
      continue
    }

    // ── Fallback: unindented quantity line (rare: "5 Stk x 8,00") ──────────
    const bareQtyM = trimmed.match(/^(\d+)\s+Stk\s+x\s+(\d+,\d{2})$/)
    if (bareQtyM && items.length > 0) {
      const last = items[items.length - 1]
      last.quantity = parseInt(bareQtyM[1], 10)
      last.unitPriceCents = parseCents(bareQtyM[2])
      continue
    }

    // If this is an unindented line that didn't match any pattern, save it as
    // a pending name for the next product line (in case it's a name without price)
    if (!isIndented) {
      pendingName = trimmed
    }
  }

  return items
}

// ---------------------------------------------------------------------------
// Footer parser
// ---------------------------------------------------------------------------

function parseFooter(text: string): {
  receiptDate: string
  receiptTime: string
  receiptNr: string
  marketNr: string
  paymentMethod: string
  totalAmountCents: number
} {
  let receiptDate = ""
  let receiptTime = ""
  let receiptNr = ""
  let marketNr = ""
  let paymentMethod = ""
  let totalAmountCents = 0

  for (const line of text.split("\n")) {
    const t = line.trim()

    // Total: "SUMME EUR -38,29"
    const summeM = t.match(/SUMME\s+EUR\s+(-?\d+,\d{2})/)
    if (summeM) totalAmountCents = parseCents(summeM[1])

    // Payment: "Geg. BAR EUR -38,29"
    const gegM = t.match(/Geg\.\s+(.+?)\s+EUR\s+(-?\d+,\d{2})/)
    if (gegM) paymentMethod = gegM[1].trim()

    // Date+time+receipt: "29.12.2025 12:07 Bon-Nr.:4546"
    const dateM = t.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+Bon-Nr\.:(\d+)/)
    if (dateM) {
      receiptDate = toIsoDate(dateM[1])
      receiptTime = dateM[2]
      receiptNr = dateM[3]
    }

    // Market number: "Markt:6857 Kasse:6 ..."
    const marktM = t.match(/Markt:(\d+)/)
    if (marktM) marketNr = marktM[1]
  }

  return { receiptDate, receiptTime, receiptNr, marketNr, paymentMethod, totalAmountCents }
}
