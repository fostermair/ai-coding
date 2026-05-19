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

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c]))
    .replace(/\b(gr|g|ml|l|kg|gg|stk|stueck|st)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function isWeightItemLine(nameRaw: string): boolean {
  return /\d+\s*(?:gg|kg|g)\s*$/.test(nameRaw) || /\d+\s*(?:ml|l)\s*$/.test(nameRaw)
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

    // Extract all prices and validate them
    const allPrices = prices.map((p) => parseCents(p.replace(/\s*€/, "").trim()))
    if (allPrices.length < 2) continue

    // Determine unit price vs total price
    // If both prices are equal, assume first is unit price and second is also unit (not total)
    // This might indicate an invalid format
    const price1 = allPrices[0]
    const price2 = allPrices[1]

    let unitPrice: number
    let totalPrice: number

    // If prices differ significantly, smaller is unit, larger is total
    if (Math.abs(price1 - price2) > 10) {
      unitPrice = Math.min(price1, price2)
      totalPrice = Math.max(price1, price2)
    } else {
      // Prices are similar or identical - could be unit price or invalid
      // Use the first price as unit price
      unitPrice = price1
      totalPrice = price2 || price1
    }

    // Find where the prices are in the line to extract name
    const firstPriceIdx = line.indexOf(prices[0])
    if (firstPriceIdx < 0) continue

    const nameRaw = line.substring(0, firstPriceIdx).trim()
    if (!nameRaw || nameRaw.length < 2) continue

    // Extract name - remove trailing weight/quantity
    const name = nameRaw.replace(/\s+\d+(?:gg|kg|g|ml|l)?\s*$/, "").trim()
    if (!name || name.length < 2) continue

    // Parse quantity - look for number before first price
    let qty = 1

    // Check for weight notation (gg, g, kg, ml, l)
    const weightMatch = nameRaw.match(/(\d+)\s*(?:gg|kg|g|ml|l)\s*$/)
    if (weightMatch) {
      qty = parseInt(weightMatch[1])
    } else {
      // Look for trailing number in name
      const qtyMatch = nameRaw.match(/\s+(\d+(?:[,\.]\d+)?)\s*$/)
      if (qtyMatch) {
        qty = parseFloat(qtyMatch[1].replace(",", "."))
      }
    }

    // Validate prices against quantity: totalPrice should be ≈ unitPrice × qty
    // Allow ±30% tolerance for rounding and errors, but skip obvious mismatches
    if (qty > 1 && totalPrice > 0) {
      const expectedTotal = unitPrice * qty
      const tolerance = Math.max(expectedTotal * 0.30, 50) // At least ±50 cents tolerance
      if (Math.abs(totalPrice - expectedTotal) > tolerance) {
        // Prices don't match quantity, skip this item (probably parsing error)
        continue
      }
    }

    // Parse delivery qty (often at end of line)
    let deliveryQty = qty
    const delMatch = line.match(/(\d+)\s*(?:gg)?\s*$/)
    if (delMatch) {
      const val = parseInt(delMatch[1])
      if (val !== qty && val > 0) {
        deliveryQty = val
      }
    }

    items.push({
      name: name.trim(),
      qty,
      unitPrice,
      totalPrice,
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
