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

function isSkipLine(line: string): boolean {
  return (
    /^(Artikel|Menge|Einzelpreis|Betrag|Liefermenge)/.test(line) ||
    line.includes("─") ||
    line.includes("PFAND") ||
    line.includes("Servicegebühr") ||
    line.includes("Einweg") ||
    line.includes("Mehrweg") ||
    line.includes("Summe") ||
    line.includes("Total") ||
    line.includes("EUR") ||
    line.startsWith("Herkunftsland") ||
    line.startsWith("Gebühren") ||
    /^[A-Z ]+$/.test(line)
  )
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

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

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
    if (isSkipLine(line)) {
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

    let prices = line.match(/([\d,\.]+)\s*€/g)

    // Look-ahead: if this line has no prices, try merging with next lines until prices found
    // This handles multi-line items where product name and price are on separate lines
    if (!prices || prices.length < 2) {
      for (let lookahead = 1; lookahead <= 2 && i + lookahead < lines.length; lookahead++) {
        const nextLine = lines[i + lookahead]
        const nextPrices = nextLine.match(/([\d,\.]+)\s*€/g)

        // Merge current line with next line
        line = line + " " + nextLine

        if (nextPrices && nextPrices.length >= 2) {
          // Found prices, stop merging
          prices = nextPrices
          i += lookahead // Skip the merged lines
          break
        }
      }
    }

    if (!prices || prices.length < 2) continue

    const allPrices = prices.map((p) => parseCents(p.replace(/\s*€/, "").trim()))
    if (allPrices.length < 2) continue

    // Delivery qty (Liefermenge) is at the end of the line, optionally followed by "gg"
    const delMatch = line.match(/(\d+)\s*(?:gg)?\s*$/)
    const isWeightItem = /\d+\s*gg\s*$/.test(line.trim())
    let rawDeliveryQty = delMatch ? parseInt(delMatch[1]) : null

    // If no inline delivery qty, look ahead past note lines (Einweg, Herkunftsland, etc.)
    // for a lone integer on its own line — that's the detached delivery qty
    if (rawDeliveryQty === null) {
      for (let dq = 1; dq <= 3; dq++) {
        if (i + dq >= lines.length) break
        const peek = lines[i + dq]
        if (isSkipLine(peek)) continue
        const loneNum = peek.match(/^(\d+)\s*(?:gg)?\s*$/)
        if (loneNum) {
          rawDeliveryQty = parseInt(loneNum[1])
          i += dq
        }
        break
      }
    }

    // Find where the first price starts — everything before it is the product name
    const firstPriceIdx = line.indexOf(prices[0])
    if (firstPriceIdx < 0) continue

    const nameRaw = line.substring(0, firstPriceIdx).trim()
    if (!nameRaw || nameRaw.length < 2) continue

    // Clean up page numbers ("1 von2") and embedded table headers from PDF parsing
    const nameCleaned = nameRaw
      .replace(/^\d+\s+von\s*\d+\s*/i, "")
      .replace(/ArtikelbezeichnungBestellmengeEinzelpreisBetragLiefermenge\s*/gi, "")
      .trim()
    if (!nameCleaned || nameCleaned.length < 2) continue

    // Remove trailing package-size suffix (e.g. "100g", "125g") from the name
    const name = nameCleaned.replace(/\s+\d+(?:gg|kg|g|ml|l)?\s*$/, "").trim()
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
