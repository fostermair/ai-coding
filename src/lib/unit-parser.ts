export interface ParseUnitResult {
  normalized_amount: number | null
  normalized_unit: "g" | "ml" | "Stück" | null
  price_per_unit_cents: number | null
}

function parseNum(s: string): number {
  return parseFloat(s.replace(",", "."))
}

function calcPricePerUnit(
  unitPriceCents: number,
  amount: number,
  unit: "g" | "ml" | "Stück"
): number | null {
  // BUG-2 fix: guard against division by zero (e.g. raw_name "0G")
  if (amount === 0) return null
  if (unit === "g" || unit === "ml") {
    return Math.round((unitPriceCents / amount) * 100)
  }
  return Math.round(unitPriceCents / amount)
}

/**
 * Parses a REWE raw product name for quantity/unit information.
 * Returns normalized_amount in base unit (g, ml, or Stück), the unit, and
 * the computed price per 100g/100ml or per Stück. All fields are null when
 * no pattern is recognized — no error is thrown.
 */
export function parseUnit(rawName: string, unitPriceCents: number): ParseUnitResult {
  const NULL_RESULT: ParseUnitResult = {
    normalized_amount: null,
    normalized_unit: null,
    price_per_unit_cents: null,
  }

  // 1. Multi-pack WITH unit: 4X250G, 6X1L, 4X0,5KG
  const multiMatch = rawName.match(
    /(\d+(?:[.,]\d+)?)\s*[Xx]\s*(\d+(?:[.,]\d+)?)\s*(KG|GR|G|LT|L|ML)\b/i
  )
  if (multiMatch) {
    const count = parseNum(multiMatch[1])
    const amount = parseNum(multiMatch[2])
    const unitStr = multiMatch[3].toUpperCase()
    let normalizedAmount: number
    let normalizedUnit: "g" | "ml"
    if (unitStr === "KG") {
      normalizedAmount = Math.round(count * amount * 1000)
      normalizedUnit = "g"
    } else if (unitStr === "G" || unitStr === "GR") {
      normalizedAmount = Math.round(count * amount)
      normalizedUnit = "g"
    } else if (unitStr === "L" || unitStr === "LT") {
      normalizedAmount = Math.round(count * amount * 1000)
      normalizedUnit = "ml"
    } else {
      // ML
      normalizedAmount = Math.round(count * amount)
      normalizedUnit = "ml"
    }
    return {
      normalized_amount: normalizedAmount,
      normalized_unit: normalizedUnit,
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, normalizedAmount, normalizedUnit),
    }
  }

  // 2. KG: 1KG, 0.5KG, 0,5KG, 1,5KG
  const kgMatch = rawName.match(/(\d+(?:[.,]\d+)?)\s*KG\b/i)
  if (kgMatch) {
    const amount = Math.round(parseNum(kgMatch[1]) * 1000)
    return {
      normalized_amount: amount,
      normalized_unit: "g",
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, amount, "g"),
    }
  }

  // 3. ML (before L to avoid ambiguity): 500ML, 500 ML
  const mlMatch = rawName.match(/(\d+(?:[.,]\d+)?)\s*ML\b/i)
  if (mlMatch) {
    const amount = Math.round(parseNum(mlMatch[1]))
    return {
      normalized_amount: amount,
      normalized_unit: "ml",
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, amount, "ml"),
    }
  }

  // 4. L / LT: 1L, 0.5L, 0,5L, 1LT, 1 LT
  const lMatch = rawName.match(/(\d+(?:[.,]\d+)?)\s*LT?\b/i)
  if (lMatch) {
    const amount = Math.round(parseNum(lMatch[1]) * 1000)
    return {
      normalized_amount: amount,
      normalized_unit: "ml",
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, amount, "ml"),
    }
  }

  // 5. G / GR: 250G, 250 G, 250GR, 250 GR
  const gMatch = rawName.match(/(\d+(?:[.,]\d+)?)\s*GR?\b/i)
  if (gMatch) {
    const amount = Math.round(parseNum(gMatch[1]))
    return {
      normalized_amount: amount,
      normalized_unit: "g",
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, amount, "g"),
    }
  }

  // 6. STK / ST: 6ST, 6 ST, 6STK, 6 STK
  // BUG-1 fix: use explicit negative lookahead instead of \b so that "STÜCK" is not
  // matched (JS \b treats non-ASCII Ü as word boundary after ST, causing false positives)
  const stMatch = rawName.match(/(\d+(?:[.,]\d+)?)\s*STK?(?![a-zA-ZäöüÄÖÜ])/i)
  if (stMatch) {
    const amount = Math.round(parseNum(stMatch[1]))
    return {
      normalized_amount: amount,
      normalized_unit: "Stück",
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, amount, "Stück"),
    }
  }

  // 7. Bare multiplier: 6X (no unit after X)
  const xMatch = rawName.match(/\b(\d+)\s*[Xx](?!\s*\d)/)
  if (xMatch) {
    const amount = parseInt(xMatch[1], 10)
    return {
      normalized_amount: amount,
      normalized_unit: "Stück",
      price_per_unit_cents: calcPricePerUnit(unitPriceCents, amount, "Stück"),
    }
  }

  return NULL_RESULT
}
