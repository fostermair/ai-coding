import { ParsedReceipt, ParsedItem, ParsedDiscount } from "./rewe"

function parseCents(s: string): number {
  return Math.round(parseFloat(s.replace(",", ".")) * 100)
}

function toIsoDate(s: string): string {
  const [d, m, y] = s.split(".")
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function parseLidlEbon(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trimEnd())

  // Validate format by looking for required markers
  const hasEUR = lines.some((l) => /^EUR\s*$/.test(l.trim()))
  const hasZuZahlen = lines.some((l) => /^zu zahlen/.test(l.trim()))

  if (!hasEUR || !hasZuZahlen) {
    throw new Error("Format nicht erkannt: Kein Lidl eBon")
  }

  const storeName = extractStoreName(lines)
  const storeAddress = extractStoreAddress(lines)
  const { receiptDate, receiptTime, receiptNr, marketNr, paymentMethod, totalAmountCents } =
    extractFooter(lines)

  const items = parseItemLines(lines)

  return {
    storeName,
    storeAddress,
    storeUid: "",
    marketNr,
    receiptNr,
    receiptDate,
    receiptTime,
    paymentMethod,
    totalAmountCents,
    items,
    storeChain: "lidl",
  }
}

function extractStoreName(lines: string[]): string {
  return "LIDL"
}

function extractStoreAddress(lines: string[]): string {
  // Find lines between LIDL and EUR
  let start = -1
  let end = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (/^LIDL\s*$/.test(trimmed)) start = i
    if (/^EUR\s*$/.test(trimmed)) {
      end = i
      break
    }
  }

  if (start >= 0 && end > start) {
    const addressLines = lines.slice(start + 1, end).filter((l) => l.trim())
    return addressLines.join(", ")
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
  // Look for pattern: "marketNr receiptNr/page DD.MM.YY HH:MM" or similar
  // Example: "1812 302127/01 31.01.26 16:37"
  let receiptDate = "2000-01-01"
  let receiptTime = "00:00"
  let receiptNr = ""
  let marketNr = ""
  let paymentMethod = "Unbekannt"
  let totalAmountCents = 0

  // Look for the receipt info line (contains date pattern DD.MM.YY)
  const receiptLinePattern = /(\d{4})\s+(\d{6})\/\d+\s+(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/
  const receiptLine = lines.find((l) => receiptLinePattern.test(l))

  if (receiptLine) {
    const match = receiptLine.match(receiptLinePattern)
    if (match) {
      marketNr = match[1]
      receiptNr = match[2]
      const day = match[3]
      const month = match[4]
      const year = `20${match[5]}`
      const hour = match[6]
      const min = match[7]
      receiptDate = `${year}-${month}-${day}`
      receiptTime = `${hour}:${min}`
    }
  }

  // Extract payment method and total
  const zahlenIdx = lines.findIndex((l) => /^zu zahlen/.test(l.trim()))
  if (zahlenIdx !== -1) {
    const zahlenLine = lines[zahlenIdx]
    const match = zahlenLine.match(/zu zahlen\s+([\d,]+)/)
    if (match) {
      totalAmountCents = parseCents(match[1])
    }
  }

  // Find payment method (line after "zu zahlen")
  if (zahlenIdx !== -1 && zahlenIdx + 1 < lines.length) {
    const paymentLine = lines[zahlenIdx + 1].trim()
    if (paymentLine && !paymentLine.match(/^\d/)) {
      paymentMethod = paymentLine.replace(/\s+[\d.,]+$/, "").trim()
    }
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
  const eurIdx = lines.findIndex((l) => /^EUR$/.test(l.trim()))
  const zahlenIdx = lines.findIndex((l) => /^zu zahlen/.test(l.trim()))

  if (eurIdx === -1 || zahlenIdx === -1) {
    return []
  }

  const itemLines = lines.slice(eurIdx + 1, zahlenIdx)
  let position = 0
  let i = 0

  while (i < itemLines.length) {
    const line = itemLines[i].trim()
    i++

    if (!line) continue

    // Check if this is a discount line
    if (/^Preisvorteil\s+(-[\d,]+)/.test(line)) {
      const match = line.match(/^Preisvorteil\s+(-[\d,]+)/)
      if (match && items.length > 0) {
        // Add discount to last item
        const lastItem = items[items.length - 1]
        lastItem.discounts.push({
          description: "Preisvorteil",
          amountCents: parseCents(match[1]),
          taxCode: lastItem.taxCode,
        })
      }
      continue
    }

    // Parse regular item line
    // Format: "Produktname Einzelpreis x Menge Gesamtpreis Steuercode"
    // e.g., "Heidelbeeren 3,99 x 2 7,98 A"
    const itemMatch = line.match(/^(.+?)\s+([\d,]+)\s+x\s+(\d+)\s+([\d,]+)\s+([A-Z])$/)
    if (itemMatch) {
      const name = itemMatch[1].trim()
      const unitPrice = itemMatch[2]
      const quantity = parseInt(itemMatch[3], 10)
      const totalPrice = itemMatch[4]
      const taxCode = itemMatch[5]

      let itemType: "product" | "pfand" | "leergut" | "concession" = "product"
      if (name.toLowerCase().includes("transportbox")) {
        itemType = "pfand"
      }

      items.push({
        rawName: name,
        itemType,
        quantity,
        unitPriceCents: parseCents(unitPrice),
        totalPriceCents: parseCents(totalPrice),
        taxCode,
        bonusExcluded: false,
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      continue
    }

    // Format without multiplication: "Produktname Einzelpreis Steuercode"
    // e.g., "Cruspies Paprika 1,29 A"
    const singleMatch = line.match(/^(.+?)\s+([\d,]+)\s+([A-Z])$/)
    if (singleMatch) {
      const name = singleMatch[1].trim()
      const price = singleMatch[2]
      const taxCode = singleMatch[3]

      let itemType: "product" | "pfand" | "leergut" | "concession" = "product"
      if (name.toLowerCase().includes("transportbox")) {
        itemType = "pfand"
      }

      items.push({
        rawName: name,
        itemType,
        quantity: 1,
        unitPriceCents: parseCents(price),
        totalPriceCents: parseCents(price),
        taxCode,
        bonusExcluded: false,
        concessionaireCode: null,
        position: position++,
        discounts: [],
      })
      continue
    }

    // Handle Pfand items
    if (/^Pfand/.test(line)) {
      const pfandMatch = line.match(/^Pfand\s+([\d,]+)\s+([A-Z])$/)
      if (pfandMatch) {
        items.push({
          rawName: "Pfand",
          itemType: "pfand",
          quantity: 1,
          unitPriceCents: parseCents(pfandMatch[1]),
          totalPriceCents: parseCents(pfandMatch[1]),
          taxCode: pfandMatch[2],
          bonusExcluded: false,
          concessionaireCode: null,
          position: position++,
          discounts: [],
        })
      }
    }
  }

  return items
}
