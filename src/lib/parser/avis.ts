export interface ParsedAvisItem {
  name: string
  qty: number
  unitPrice: number // in cents
  totalPrice: number // in cents
  deliveryQty: number
  section: "Lieferbar" | "Nicht lieferbar" | "Ersatzartikel"
  status: "available" | "unavailable" | "substitute"
}

export interface ParsedAvis {
  pickupDate: string // YYYY-MM-DD
  orderNumber: string
  marketName?: string
  items: ParsedAvisItem[]
}

function parseCents(s: string): number {
  return Math.round(parseFloat(s.replace(",", ".")) * 100)
}

function toIsoDate(s: string): string {
  const [d, m, y] = s.split(".")
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function parseAvis(text: string): ParsedAvis {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)

  let pickupDate = ""
  let orderNumber = ""
  let marketName = ""

  // Extract header info (scan first 30 lines)
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i]

    // Look for date: "Abholtermin: 18.05.2026" or "Abholdatum"
    if (line.includes("Abholtermin") || line.includes("Abholdatum")) {
      const match = line.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
      if (match) {
        pickupDate = toIsoDate(`${match[1]}.${match[2]}.${match[3]}`)
      }
    }

    // Look for order number - can be alphanumeric (e.g. "B-CB9-EWJ-LXD")
    if (line.includes("Bestellnummer") || line.includes("Bestell-Nummer")) {
      const match = line.match(/([A-Z0-9\-]{6,})/)
      if (match) {
        orderNumber = match[1]
      }
    }

    // Market name is often after Markt line
    if ((line.includes("Markt") || line.includes("Abholstation")) && !line.includes("Nummer")) {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        if (nextLine && nextLine.length > 0 && !nextLine.match(/^[A-Z ]+$/) && !nextLine.includes(":")) {
          marketName = nextLine
        }
      }
    }
  }

  // Parse items by section
  const items: ParsedAvisItem[] = []
  let currentSection: "Lieferbar" | "Nicht lieferbar" | "Ersatzartikel" | null = null

  for (const line of lines) {
    // Section detection
    if (/^\s*(Lieferbar|LIEFERBAR)\s*$/.test(line)) {
      currentSection = "Lieferbar"
      continue
    }
    if (/^\s*(Nicht lieferbar|NICHT LIEFERBAR)\s*$/.test(line)) {
      currentSection = "Nicht lieferbar"
      continue
    }
    if (/^\s*(Ersatzartikel|ERSATZARTIKEL)\s*$/.test(line)) {
      currentSection = "Ersatzartikel"
      continue
    }

    // Skip header rows and non-item lines
    if (
      /^(Artikel|Menge|Einzelpreis|Betrag|Liefermenge)/.test(line) ||
      line.includes("─") ||
      line.includes("PFAND") ||
      line.includes("Servicegebühr") ||
      line.includes("Einweg") ||
      line.includes("Mehrweg") ||
      line.includes("Summe") ||
      line.includes("Total") ||
      line.includes("EUR") ||
      /^[A-Z ]+$/.test(line) // All caps single line (section headers)
    ) {
      continue
    }

    if (!currentSection) continue

    // Parse item line - look for pattern with amounts in €
    // Format varies but typically: "Name ... QTY ... PRICE € ... TOTAL € ... DELIVERY_QTY"

    const prices = line.match(/([\d,\.]+)\s*€/g)
    if (!prices || prices.length < 2) continue

    // Extract the prices from the matches
    const unitPriceMatch = prices[0].replace(/\s*€/, "").trim()
    const totalPriceMatch = prices[1].replace(/\s*€/, "").trim()

    // Find where the prices are in the line to extract name
    const firstPriceIdx = line.indexOf(prices[0])
    if (firstPriceIdx < 0) continue

    const nameRaw = line.substring(0, firstPriceIdx).trim()
    if (!nameRaw || nameRaw.length < 2) continue

    // Extract name - remove trailing numbers (quantity)
    const name = nameRaw.replace(/\s+\d+(?:gg)?\s*$/, "").trim()
    if (!name || name.length < 2) continue

    // Parse quantity - look for number before first price
    let qty = 1
    let isWeightItem = false

    // Check for weight notation (gg)
    const weightMatch = nameRaw.match(/(\d+)\s*gg\s*$/)
    if (weightMatch) {
      qty = parseInt(weightMatch[1])
      isWeightItem = true
    } else {
      // Look for trailing number in name
      const qtyMatch = nameRaw.match(/\s+(\d+(?:[,\.]\d+)?)\s*$/)
      if (qtyMatch) {
        qty = parseFloat(qtyMatch[1].replace(",", "."))
      }
    }

    // Parse delivery qty (often after second price)
    let deliveryQty = qty
    if (prices.length > 2) {
      const delMatch = line.substring(line.indexOf(prices[1])).match(/(\d+)\s*gg?\s*$/)
      if (delMatch) {
        deliveryQty = parseInt(delMatch[1])
      }
    } else {
      // Look for trailing number at end of line
      const delMatch = line.match(/(\d+)\s*gg?\s*$/)
      if (delMatch) {
        const val = parseInt(delMatch[1])
        if (val !== qty) {
          deliveryQty = val
        }
      }
    }

    items.push({
      name: name.trim(),
      qty,
      unitPrice: parseCents(unitPriceMatch),
      totalPrice: parseCents(totalPriceMatch),
      deliveryQty,
      section: currentSection,
      status:
        currentSection === "Lieferbar"
          ? "available"
          : currentSection === "Nicht lieferbar"
            ? "unavailable"
            : "substitute",
    })
  }

  if (!pickupDate) {
    throw new Error("Kein Abholdatum in AVIS-PDF gefunden")
  }

  if (!orderNumber) {
    throw new Error("Keine Bestellnummer in AVIS-PDF gefunden")
  }

  if (items.length === 0) {
    throw new Error("Keine Artikel in AVIS-PDF gefunden")
  }

  return {
    pickupDate,
    orderNumber,
    marketName,
    items,
  }
}
