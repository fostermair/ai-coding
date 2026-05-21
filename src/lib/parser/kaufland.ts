import { ParsedReceipt, ParsedItem, ParsedDiscount } from "./rewe"

function parseCents(s: string): number {
  return Math.round(parseFloat(s.replace(",", ".")) * 100)
}

function toIsoDate(s: string): string {
  const [d, m, y] = s.split(".")
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function parseKauflandEbon(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trimEnd())

  // Validate format by looking for required markers
  const hasSumme = lines.some((l) => /^Summe\s+[\d,]+/.test(l.trim()))
  const hasDatum = lines.some((l) => /Datum:[\d.]+\s+Zeit:/.test(l))

  if (!hasSumme || !hasDatum) {
    throw new Error("Format nicht erkannt: Kein Kaufland eBon")
  }

  const storeAddress = extractStoreAddress(lines)
  const { receiptDate, receiptTime, receiptNr, marketNr, paymentMethod, totalAmountCents } =
    extractFooter(lines)

  const items = parseItemLines(lines)

  return {
    storeName: "KAUFLAND",
    storeAddress,
    storeUid: "",
    marketNr,
    receiptNr,
    receiptDate,
    receiptTime,
    paymentMethod,
    totalAmountCents,
    items,
    storeChain: "kaufland",
  }
}

function extractStoreAddress(lines: string[]): string {
  // First non-empty line is usually the street address
  const nonEmpty = lines.filter((l) => l.trim())
  if (nonEmpty.length > 0) {
    const addressParts = [nonEmpty[0]]
    if (nonEmpty.length > 1) {
      addressParts.push(nonEmpty[1])
    }
    return addressParts.join(", ")
  }
  return ""
}

function extractFooter(lines: string[]): {
  receiptDate: string
  receiptTime: string
  receiptNr: string
  marketNr: string
  paymentMethod: string
  totalAmountCents: number
} {
  let receiptDate = "2000-01-01"
  let receiptTime = "00:00"
  let receiptNr = ""
  let marketNr = ""
  let paymentMethod = "Unbekannt"
  let totalAmountCents = 0

  // Look for Summe line: "Summe X,XX"
  const summeLine = lines.find((l) => /^Summe\s+([\d,]+)/.test(l.trim()))
  if (summeLine) {
    const match = summeLine.match(/^Summe\s+([\d,]+)/)
    if (match) {
      totalAmountCents = parseCents(match[1])
    }
  }

  // Look for receipt info: "Datum:DD.MM.YY Zeit: HH:MM:SS Bon:XXXXX"
  const dateTimeLine = lines.find((l) => /Datum:(\d{2})\.(\d{2})\.(\d{2})\s+Zeit:\s+(\d{2}):(\d{2})/.test(l))
  if (dateTimeLine) {
    const match = dateTimeLine.match(/Datum:(\d{2})\.(\d{2})\.(\d{2})\s+Zeit:\s+(\d{2}):(\d{2})/)
    if (match) {
      const day = match[1]
      const month = match[2]
      const year = `20${match[3]}`
      const hour = match[4]
      const min = match[5]
      receiptDate = `${year}-${month}-${day}`
      receiptTime = `${hour}:${min}`
    }

    // Extract receipt number
    const bonMatch = dateTimeLine.match(/Bon:(\d+)/)
    if (bonMatch) {
      receiptNr = bonMatch[1]
    }
  }

  // Look for Filiale: "Filiale: XXXX Kasse: X"
  const filialeLineIdx = lines.findIndex((l) => /Filiale:\s+(\d+)/.test(l))
  if (filialeLineIdx !== -1) {
    const match = lines[filialeLineIdx].match(/Filiale:\s+(\d+)/)
    if (match) {
      marketNr = match[1]
    }
  }

  // Extract payment method from lines containing "Kartenzahlung" or similar
  const paymentLine = lines.find((l) => {
    const t = l.trim()
    return /kartenzahlung|bargeld|karte/i.test(t) && t.length < 100
  })
  if (paymentLine) {
    paymentMethod = paymentLine.trim()
  }

  return {
    receiptDate,
    receiptTime,
    receiptNr,
    marketNr,
    paymentMethod,
    totalAmountCents,
  }
}

function parseItemLines(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = []
  const summeLine = lines.findIndex((l) => /^Summe\s+[\d,]+/.test(l.trim()))

  if (summeLine === -1) {
    return []
  }

  let position = 0
  let i = 0
  let currentItemName = ""

  while (i < summeLine) {
    const line = lines[i].trim()
    i++

    if (!line) continue

    // Check if this is a discount line: "K Card Rabatt -X,XX"
    if (/^K Card Rabatt\s+(-[\d,]+)/.test(line)) {
      const match = line.match(/^K Card Rabatt\s+(-[\d,]+)/)
      if (match && items.length > 0) {
        const lastItem = items[items.length - 1]
        lastItem.discounts.push({
          description: "K Card Rabatt",
          amountCents: parseCents(match[1]),
          taxCode: lastItem.taxCode,
        })
      }
      continue
    }

    // Try to parse item with format: "Name qty * price total taxcode"
    // e.g., "KLC.Spaghetti    4 * 0,69         2,76 B"
    const multiMatch = line.match(/^(.+?)\s+(\d+)\s+\*\s+([\d,]+)\s+([\d,]+)\s+([A-Z])$/)
    if (multiMatch) {
      const name = multiMatch[1].trim()
      const qty = parseInt(multiMatch[2], 10)
      const unitPrice = multiMatch[3]
      const totalPrice = multiMatch[4]
      const taxCode = multiMatch[5]

      items.push({
        rawName: name,
        itemType: detectItemType(name),
        quantity: qty,
        unitPriceCents: parseCents(unitPrice),
        totalPriceCents: parseCents(totalPrice),
        taxCode,
        bonusExcluded: false,
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      currentItemName = ""
      continue
    }

    // Try weight format: "Bananen 1,190 kg 1,54 B"
    const weightMatch = line.match(/^(.+?)\s+([\d,]+)\s+kg\s+([\d,]+)\s+([A-Z])$/)
    if (weightMatch) {
      const name = weightMatch[1].trim()
      const weightQty = parseFloat(weightMatch[2].replace(",", "."))
      const totalPrice = weightMatch[3]
      const taxCode = weightMatch[4]

      items.push({
        rawName: name,
        itemType: "product",
        quantity: weightQty,
        unitPriceCents: 0,
        totalPriceCents: parseCents(totalPrice),
        taxCode,
        bonusExcluded: false,
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      currentItemName = ""
      continue
    }

    // Standalone multiplier line: "2 * 1,29 2,58 B" (two-line format, product name on previous line)
    const standaloneMultiMatch = line.match(/^(\d+)\s+\*\s+([\d,]+)\s+([\d,]+)\s+([A-Z])$/)
    if (standaloneMultiMatch) {
      const qty = parseInt(standaloneMultiMatch[1], 10)
      const unitPrice = standaloneMultiMatch[2]
      const totalPrice = standaloneMultiMatch[3]
      const taxCode = standaloneMultiMatch[4]
      const name = currentItemName || "(Unbekannt)"

      items.push({
        rawName: name,
        itemType: detectItemType(name),
        quantity: qty,
        unitPriceCents: parseCents(unitPrice),
        totalPriceCents: parseCents(totalPrice),
        taxCode,
        bonusExcluded: false,
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      currentItemName = ""
      continue
    }

    // Format without multiplication: "Name price taxcode"
    // e.g., "Gutsleberwurst 2,69 B"
    const singleMatch = line.match(/^(.+?)\s+([\d,]+)\s+([A-Z])$/)
    if (singleMatch) {
      const name = singleMatch[1].trim()
      const price = singleMatch[2]
      const taxCode = singleMatch[3]

      items.push({
        rawName: name,
        itemType: detectItemType(name),
        quantity: 1,
        unitPriceCents: parseCents(price),
        totalPriceCents: parseCents(price),
        taxCode,
        bonusExcluded: false,
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      currentItemName = ""
      continue
    }

    // Unmatched line: store as potential product name for next line (two-line format)
    currentItemName = line
  }

  return items
}

function detectItemType(name: string): "product" | "pfand" | "leergut" | "concession" {
  const lower = name.toLowerCase()
  if (lower.includes("pfand")) return "pfand"
  if (lower.includes("leergut")) return "leergut"
  return "product"
}
