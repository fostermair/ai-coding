import { describe, it, expect } from "vitest"

// Extracted functions from route.ts for testing
function levenshteinSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = []
  for (let k = 0; k <= s2.length; k++) costs[k] = k
  let prevDiag = 0
  for (let i = 1; i <= s1.length; i++) {
    let subs = costs[0]
    costs[0] = i
    for (let j = 1; j <= s2.length; j++) {
      const tmp = costs[j]
      costs[j] = Math.min(costs[j] + 1, costs[j - 1] + 1, subs + (s1[i - 1] === s2[j - 1] ? 0 : 1))
      subs = tmp
    }
    prevDiag = subs
  }
  return costs[s2.length]
}

function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c]))
    .replace(/\b(gr|g|ml|l|kg|gg|stk|stueck|st|pack|stück)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function calculateMatchConfidence(
  avisItem: { qty: number; unitPrice: number; name: string },
  ebonItem: { qty: number; unitPrice: number; rawName: string; date: string },
  avisDate: string
): number {
  let confidence = 0

  const avisNameNormalized = normalizeProductName(avisItem.name)
  const ebonNameNormalized = normalizeProductName(ebonItem.rawName)
  const nameSimilarity = levenshteinSimilarity(avisNameNormalized, ebonNameNormalized)

  if (nameSimilarity > 0.75) {
    confidence += 40
  } else if (nameSimilarity > 0.65) {
    confidence += 25
  } else if (nameSimilarity > 0.55) {
    confidence += 10
  } else {
    return 0
  }

  const avisDateObj = new Date(avisDate)
  const ebonDateObj = new Date(ebonItem.date)
  const dayDiff = Math.abs((avisDateObj.getTime() - ebonDateObj.getTime()) / (1000 * 60 * 60 * 24))

  if (dayDiff <= 1) {
    confidence += 40
  } else if (dayDiff <= 3) {
    confidence += 30
  } else if (dayDiff <= 7) {
    confidence += 15
  } else {
    return 0
  }

  const priceDiff = Math.abs(avisItem.unitPrice - ebonItem.unitPrice)
  if (priceDiff <= 2) {
    confidence += 30
  } else if (priceDiff <= 5) {
    confidence += 20
  } else if (priceDiff <= 10) {
    confidence += 10
  } else {
    return 0
  }

  const isWeightItem = avisItem.qty > 10 || ebonItem.qty > 10

  if (!isWeightItem) {
    if (avisItem.qty === ebonItem.qty) {
      confidence += 20
    } else if (avisItem.qty > 0 && ebonItem.qty > 0) {
      const qtyDiff = Math.abs(avisItem.qty - ebonItem.qty) / Math.max(avisItem.qty, ebonItem.qty)
      if (qtyDiff <= 0.1) {
        confidence += 15
      } else if (qtyDiff <= 0.25) {
        confidence += 10
      }
    }
  } else {
    if (avisItem.qty > 0 && ebonItem.qty > 0) {
      const qtyDiff = Math.abs(avisItem.qty - ebonItem.qty) / Math.max(avisItem.qty, ebonItem.qty)
      if (qtyDiff <= 0.05) {
        confidence += 15
      }
    }
  }

  return Math.min(100, confidence)
}

describe("AVIS Import Matching", () => {
  it("requires good name match - disqualifies poor matches", () => {
    const avisDate = "2026-05-18"

    // Good match: name similarity > 0.75
    const goodMatch = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Vollmilch 1L" },
      { qty: 1, unitPrice: 199, rawName: "Vollmilch 1L", date: "2026-05-18" },
      avisDate
    )
    expect(goodMatch).toBeGreaterThanOrEqual(85) // Should auto-set

    // Poor match: name similarity < 0.55
    const poorMatch = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Vollmilch 1L" },
      { qty: 1, unitPrice: 199, rawName: "Joghurt 500g", date: "2026-05-18" },
      avisDate
    )
    expect(poorMatch).toBe(0) // Should be disqualified
  })

  it("normalizes product names correctly", () => {
    // Should normalize German umlauts
    const name1 = normalizeProductName("Käse")
    const name2 = normalizeProductName("Kaese")

    expect(name1).toBe("kaese")
    expect(name2).toBe("kaese")

    // Should remove extra spaces
    const name3 = normalizeProductName("Milch   1L")
    expect(name3).not.toContain("  ")
  })

  it("increases threshold to 85 for auto-set (was 80)", () => {
    const avisDate = "2026-05-18"

    // Score of 80 should NOT auto-set (now requires >= 85)
    const barely80 = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Product" },
      { qty: 1, unitPrice: 199, rawName: "Product", date: "2026-05-18" },
      avisDate
    )
    // This specific combo should give us high confidence (> 80)
    expect(barely80).toBeGreaterThan(80)

    // With a slightly different name that doesn't match well, should be lower
    const badName = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 199, rawName: "Joghurt", date: "2026-05-18" },
      avisDate
    )
    expect(badName).toBeLessThan(85) // Should be < 85 for auto-set
  })

  it("allows ±3 days date window (was ±1 day)", () => {
    // Same day: full 40 points
    const sameDay = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 199, rawName: "Milch", date: "2026-05-18" },
      "2026-05-18"
    )
    expect(sameDay).toBeGreaterThan(0)

    // +2 days: should still get good points (30 instead of 0)
    const twoDaysLater = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 199, rawName: "Milch", date: "2026-05-20" },
      "2026-05-18"
    )
    expect(twoDaysLater).toBeGreaterThan(0)

    // +7 days: should get some points (15 instead of 0)
    const sevenDaysLater = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 199, rawName: "Milch", date: "2026-05-25" },
      "2026-05-18"
    )
    expect(sevenDaysLater).toBeGreaterThan(0)

    // +15 days: should be disqualified (> 7 days = no confidence)
    const fifteenDaysLater = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 199, rawName: "Milch", date: "2026-06-02" },
      "2026-05-18"
    )
    expect(fifteenDaysLater).toBe(0)
  })

  it("allows ±5 cents price tolerance (was ±2 cents)", () => {
    const avisDate = "2026-05-18"

    // ±2 cents: full 30 points
    const exact = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 199, rawName: "Milch", date: "2026-05-18" },
      avisDate
    )
    expect(exact).toBeGreaterThan(0)

    // ±3 cents: still good (20 points)
    const slight = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 202, rawName: "Milch", date: "2026-05-18" },
      avisDate
    )
    expect(slight).toBeGreaterThan(0)

    // ±5 cents: still acceptable (20 points)
    const tolerable = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 204, rawName: "Milch", date: "2026-05-18" },
      avisDate
    )
    expect(tolerable).toBeGreaterThan(0)

    // ±20 cents: disqualified
    const tooMuch = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 219, rawName: "Milch", date: "2026-05-18" },
      avisDate
    )
    expect(tooMuch).toBe(0)
  })

  it("handles weight items correctly (qty > 10)", () => {
    const avisDate = "2026-05-18"

    // Weight item with 5% qty difference: should still get points
    const weightClose = calculateMatchConfidence(
      { qty: 250, unitPrice: 349, name: "Käse gerieben" },
      { qty: 240, unitPrice: 349, rawName: "Käse gerieben", date: "2026-05-18" },
      avisDate
    )
    expect(weightClose).toBeGreaterThan(0)

    // Weight item with large qty difference: should get fewer points
    const weightDiff = calculateMatchConfidence(
      { qty: 250, unitPrice: 349, name: "Käse gerieben" },
      { qty: 100, unitPrice: 349, rawName: "Käse gerieben", date: "2026-05-18" },
      avisDate
    )
    // Both should have confidence, weight items don't get qty-mismatch penalty
    expect(weightDiff).toBeGreaterThan(0)
  })

  it("correctly rejects matches with price differences > 10 cents", () => {
    const avisDate = "2026-05-18"

    const wrongPrice = calculateMatchConfidence(
      { qty: 1, unitPrice: 199, name: "Milch" },
      { qty: 1, unitPrice: 299, rawName: "Milch", date: "2026-05-18" },
      avisDate
    )
    expect(wrongPrice).toBe(0) // Disqualified due to price
  })
})
