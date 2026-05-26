export interface ParsedBestellungItem {
  articleName: string
  quantityAmount: number
  quantityUnit: string // g, kg, ml, l, Stück, or combined like "x330ml"
  unitPriceCents: number // in cents
  totalPriceCents: number // in cents
}

export interface ParsedBestellung {
  orderNumber: string
  items: ParsedBestellungItem[]
}

function parseCents(s: string): number {
  return Math.round(parseFloat(s.replace(",", ".")) * 100)
}

function normalizeQuantity(s: string): { amount: number; unit: string } {
  // Examples: "500g", "0,5 kg", "6x330ml", "1 Stück", "500", "0,5"
  s = s.trim().toLowerCase()

  // Try to match "NUMxUNIT" pattern (e.g. "6x330ml") - includes German umlauts (ä,ö,ü,ß)
  const multiMatch = s.match(/^(\d+(?:[,\.]\d+)?)\s*x\s*(\d+(?:[,\.]\d+)?)\s*([a-züäöß]+)?\s*$/)
  if (multiMatch) {
    const qty = parseInt(multiMatch[1])
    const size = parseFloat(multiMatch[2].replace(",", "."))
    const unit = multiMatch[3] || ""
    return {
      amount: qty,
      unit: `${qty}x${size}${unit}`,
    }
  }

  // Try to match "NUMBER UNIT" pattern - includes German umlauts
  const match = s.match(/^(\d+(?:[,\.]\d+)?)\s*([a-züäöß]+)?\s*$/)
  if (match) {
    const amount = parseFloat(match[1].replace(",", "."))
    const unit = match[2] || ""
    return { amount, unit: unit || "Stück" }
  }

  // Fallback: return as-is with "Stück"
  return { amount: 1, unit: s || "Stück" }
}

function isSkipLine(line: string): boolean {
  return (
    /^(Artikel|Menge|Einzelpreis|Betrag|Gewicht|EUR|EURO)/.test(line) ||
    line.includes("─") ||
    line.includes("Summe") ||
    line.includes("Total") ||
    line.includes("Gesamtbetrag") ||
    line.includes("Lieferadresse") ||
    line.includes("Rechnungsadresse") ||
    line.includes("Bestellnummer") ||
    line.includes("REWE") ||
    /^[A-Z ]+$/.test(line)
  )
}

export function parseBestellung(text: string): ParsedBestellung {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let orderNumber = ""

  // Extract order number (check all lines for prose format, first 20 for labeled format)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Real REWE format: "wir haben deine Bestellung B-USQ-SPQ-FC5 erhalten"
    // Pattern: B-XXX-XXX-XXX (3 groups of 1-3 alphanumeric chars separated by dashes)
    const proseMatch = line.match(/Bestellung\s+([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+)\s+erhalten/i)
    if (proseMatch && !orderNumber) {
      orderNumber = proseMatch[1]
      break
    }

    // Only check first 20 lines for other formats to avoid false matches
    if (i >= 20) continue

    // Old format: "Bestellnummer: MO1234567890"
    if (line.includes("Bestellnummer") || line.includes("Bestell-Nummer") || line.includes("Bestellnr")) {
      const match = line.match(/([A-Z]{2}\d{10,}|\d{10,})/)
      if (match) {
        orderNumber = match[1]
        break
      }
    }

    // Standalone pattern like "MO1234567890" at line start
    const standalonMatch = line.match(/^([A-Z]{2}\d{10,})/)
    if (standalonMatch && !orderNumber) {
      orderNumber = standalonMatch[1]
    }
  }

  if (!orderNumber) {
    throw new Error("Keine Bestellnummer in Bestellbestätigung gefunden")
  }

  // Parse items
  const items: ParsedBestellungItem[] = []

  // Helper function to extract quantity from article name
  function extractQtyFromName(name: string): { quantityAmount: number; quantityUnit: string } {
    const qtyMatch = name.match(/\s+([\d,\.]+(?:\s*x\s*[\d,\.]+)?\s*[a-züäöß]+)\s*$/i)
    if (qtyMatch) {
      const normalized = normalizeQuantity(qtyMatch[1])
      return { quantityAmount: normalized.amount, quantityUnit: normalized.unit }
    }
    return { quantityAmount: 1, quantityUnit: "Stück" }
  }

  let pendingNxItem: { count: number; nameLines: string[] } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip header and metadata lines
    if (isSkipLine(line)) {
      continue
    }

    // ─ Real REWE email format parsing ───────────────────────────────────

    // Multi-line item continuation: waiting for price after name
    if (pendingNxItem) {
      const priceOnlyMatch = line.match(/^(\d+,\d{2})\s*€\s*$/)
      if (priceOnlyMatch) {
        // Got the price — finalize the item
        const nameRaw = pendingNxItem.nameLines.join(" ").trim()
        const totalPriceCents = parseCents(priceOnlyMatch[1])
        const unitPriceCents = Math.round(totalPriceCents / pendingNxItem.count)
        const { quantityAmount, quantityUnit } = extractQtyFromName(nameRaw)

        items.push({
          articleName: nameRaw,
          quantityAmount,
          quantityUnit,
          unitPriceCents,
          totalPriceCents,
        })
        pendingNxItem = null
      } else {
        // More name continuation
        pendingNxItem.nameLines.push(line.trim())
      }
      continue
    }

    // Single-line item: "1xArticleName500g0,99 €" (no space between name and price)
    const singleNxMatch = line.match(/^(\d+)x(.*?)(\d+,\d{2})\s*€\s*$/)
    if (singleNxMatch) {
      const count = parseInt(singleNxMatch[1])
      const nameRaw = singleNxMatch[2].trim()
      const totalPriceCents = parseCents(singleNxMatch[3])
      const unitPriceCents = Math.round(totalPriceCents / count)
      const { quantityAmount, quantityUnit } = extractQtyFromName(nameRaw)

      items.push({
        articleName: nameRaw,
        quantityAmount,
        quantityUnit,
        unitPriceCents,
        totalPriceCents,
      })
      continue
    }

    // Multi-line start: "2xL'Oréal Men Expert..." (starts with Nx, no € on line)
    const multiNxStart = line.match(/^(\d+)x(.+)$/)
    if (multiNxStart && !line.includes("€")) {
      pendingNxItem = {
        count: parseInt(multiNxStart[1]),
        nameLines: [multiNxStart[2].trim()],
      }
      continue
    }

    // ────────────────────────────────────────────────────────────────────

    // Old format: look for two price patterns on same line (unit price + total price)
    const prices = line.match(/([\d,\.]+)\s*€/g)
    if (!prices || prices.length < 2) {
      continue
    }

    const allPrices = prices.map((p) => parseCents(p.replace(/\s*€/, "").trim()))
    if (allPrices.length < 2) {
      continue
    }

    // Extract article name: everything before first € sign
    const firstPriceIdx = line.indexOf(prices[0])
    if (firstPriceIdx < 0) {
      continue
    }

    const articleNameRaw = line.substring(0, firstPriceIdx).trim()
    if (!articleNameRaw || articleNameRaw.length < 2) {
      continue
    }

    // Clean up page numbers and embedded headers
    const articleName = articleNameRaw
      .replace(/^\d+\s+von\s*\d+\s*/i, "")
      .replace(/ArtikelbezeichnungMengeEinzelpreisBetrag\s*/gi, "")
      .trim()

    if (!articleName || articleName.length < 2) {
      continue
    }

    // Extract quantity: look for patterns like "500g", "0,5 kg", "6x330ml" at the end of article name
    // or as a separate token after the name
    let quantityAmount = 1
    let quantityUnit = "Stück"

    // Try to extract quantity from the article name suffix
    const qtyMatch = articleName.match(/\s+([\d,\.]+\s*(?:x\s*)?[\d,\.]*\s*[a-z]+)\s*$/)
    if (qtyMatch) {
      const qtyStr = qtyMatch[1]
      const normalized = normalizeQuantity(qtyStr)
      quantityAmount = normalized.amount
      quantityUnit = normalized.unit
    }

    // Prices: typically last two prices are unit price and total price
    const unitPriceCents = allPrices[allPrices.length - 2]
    const totalPriceCents = allPrices[allPrices.length - 1]

    items.push({
      articleName: articleName.trim(),
      quantityAmount,
      quantityUnit,
      unitPriceCents,
      totalPriceCents,
    })
  }

  if (items.length === 0) {
    throw new Error("Keine Artikel in Bestellbestätigung gefunden")
  }

  return {
    orderNumber,
    items,
  }
}
