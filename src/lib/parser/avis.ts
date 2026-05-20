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

    // Parse item line.
    // AVIS PDFs concatenate table columns without spaces, so a line like:
    //   "Geflügel-Mortadella 100g  7  1,19 €  8,33 €  7"
    // becomes: "Geflügel-Mortadella 100g71,19 €8,33 €7"
    // where order-qty "7" is merged into the unit-price "1,19 €" → "71,19 €".
    // Strategy: use the delivery qty at line-end as the real qty and derive
    // unit price from total ÷ qty. The "first merged price" is not used directly.

    const prices = line.match(/([\d,\.]+)\s*€/g)
    if (!prices || prices.length < 2) continue

    const allPrices = prices.map((p) => parseCents(p.replace(/\s*€/, "").trim()))
    if (allPrices.length < 2) continue

    // Delivery qty (Liefermenge) is at the end of the line, optionally followed by "gg"
    const delMatch = line.match(/(\d+)\s*(?:gg)?\s*$/)
    const isWeightItem = /\d+\s*gg\s*$/.test(line.trim())
    const rawDeliveryQty = delMatch ? parseInt(delMatch[1]) : null

    // Find where the first price starts — everything before it is the product name
    const firstPriceIdx = line.indexOf(prices[0])
    if (firstPriceIdx < 0) continue

    const nameRaw = line.substring(0, firstPriceIdx).trim()
    if (!nameRaw || nameRaw.length < 2) continue

    // Remove trailing package-size suffix (e.g. "100g", "125g") from the name
    const name = nameRaw.replace(/\s+\d+(?:gg|kg|g|ml|l)?\s*$/, "").trim()
    if (!name || name.length < 2) continue

    let unitPrice: number
    let totalPrice: number
    let qty: number
    let deliveryQty: number

    if (!isWeightItem && rawDeliveryQty !== null && rawDeliveryQty > 0) {
      // Regular (count-based) item: delivery qty = order qty; last € amount = Betrag.
      // Unit price derived as Betrag ÷ qty avoids the column-merging confusion.
      qty = rawDeliveryQty
      deliveryQty = rawDeliveryQty
      totalPrice = allPrices[allPrices.length - 1]
      unitPrice = qty > 0 ? Math.round(totalPrice / qty) : totalPrice
    } else {
      // Weight item or fallback: prices as-found (old logic)
      const price1 = allPrices[0]
      const price2 = allPrices[1]
      if (Math.abs(price1 - price2) > 10) {
        unitPrice = Math.min(price1, price2)
        totalPrice = Math.max(price1, price2)
      } else {
        unitPrice = price1
        totalPrice = price2 || price1
      }
      // For weight items qty comes from the nameRaw weight suffix
      const weightMatch = nameRaw.match(/(\d+)\s*(?:gg|kg|g|ml|l)\s*$/)
      if (weightMatch) {
        qty = parseInt(weightMatch[1])
      } else {
        const qtyMatch = nameRaw.match(/\s+(\d+(?:[,\.]\d+)?)\s*$/)
        qty = qtyMatch ? parseFloat(qtyMatch[1].replace(",", ".")) : 1
      }
      deliveryQty = rawDeliveryQty ?? qty
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
