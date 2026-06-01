// Fuzzy matching utilities for AVIS-to-eBon matching and global database suggestions

// SQL fragment to filter out already-matched AVIS items (those that exist as aliases)
export const FILTER_MATCHED_AVIS_ITEMS = `NOT EXISTS (SELECT 1 FROM product_aliases WHERE product_aliases.alias = avis_matches.avis_item_name)`

export function levenshteinSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) return 1
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

export function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = []
  for (let k = 0; k <= s2.length; k++) costs[k] = k
  for (let i = 1; i <= s1.length; i++) {
    let subs = costs[0]
    costs[0] = i
    for (let j = 1; j <= s2.length; j++) {
      const tmp = costs[j]
      costs[j] = Math.min(costs[j] + 1, costs[j - 1] + 1, subs + (s1[i - 1] === s2[j - 1] ? 0 : 1))
      subs = tmp
    }
  }
  return costs[s2.length]
}

// Token-based similarity: splits into words and scores each eBon token against AVIS tokens.
// Handles the case where AVIS has full brand names and eBon has short abbreviations.
export function tokenBasedSimilarity(avisNorm: string, ebonNorm: string): number {
  const tokenize = (s: string) => s.split(/[\s\-.!,&+]+/).filter((t) => t.length >= 3)
  const avisTokens = tokenize(avisNorm)
  const ebonTokens = tokenize(ebonNorm)

  if (ebonTokens.length === 0 || avisTokens.length === 0) return 0

  let totalScore = 0
  for (const et of ebonTokens) {
    let bestScore = 0
    for (const at of avisTokens) {
      // Containment check: catches prefix abbreviations ("gefl" in "gefluegel"),
      // suffix abbreviations ("spray" in "deospray"), and exact substrings.
      const score = at.includes(et) || et.includes(at) ? 1.0 : levenshteinSimilarity(et, at)
      if (score > bestScore) bestScore = score
    }
    totalScore += bestScore
  }

  return totalScore / ebonTokens.length
}

export function normalizeProductName(name: string): string {
  const umlauts: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" }
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => umlauts[c] || c)
    .replace(/\b(gr|g|ml|l|kg|gg|stk|stueck|st|pack|stück)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function computeMatchScore(
  avisName: string,
  ebonRawName: string
): number {
  const avisNameNormalized = normalizeProductName(avisName)
  const ebonNameNormalized = normalizeProductName(ebonRawName)
  const lev = levenshteinSimilarity(avisNameNormalized, ebonNameNormalized)
  const tok = tokenBasedSimilarity(avisNameNormalized, ebonNameNormalized)
  return Math.max(lev, tok * 0.9) * 100
}

export function suggestAlias(
  rawName: string,
  existingAliases: Array<{ raw_name: string; alias: string }>
): { suggestion: string | null; confidence: number } {
  if (existingAliases.length === 0) return { suggestion: null, confidence: 0 }

  let bestScore = 0
  let bestAlias: string | null = null

  for (const existing of existingAliases) {
    const score = computeMatchScore(existing.raw_name, rawName)
    if (score > bestScore) {
      bestScore = score
      bestAlias = existing.alias
    }
  }

  return {
    suggestion: bestScore > 0 ? bestAlias : null,
    confidence: Math.round(bestScore),
  }
}

export function calculateMatchConfidence(
  avisItem: { qty: number; unitPrice: number; name: string },
  ebonItem: { qty: number; unitPrice: number; rawName: string; date: string },
  avisDate: string
): number {
  let confidence = 0

  // 1. NAME MATCHING: This is the primary filter (0-40 points)
  // AVIS has full brand names; eBon has short abbreviations — use token-based matching
  // as the primary score and fall back to full-string Levenshtein.
  const avisNameNormalized = normalizeProductName(avisItem.name)
  const ebonNameNormalized = normalizeProductName(ebonItem.rawName)
  const lev = levenshteinSimilarity(avisNameNormalized, ebonNameNormalized)
  const tok = tokenBasedSimilarity(avisNameNormalized, ebonNameNormalized)
  const nameSimilarity = Math.max(lev, tok * 0.9)

  if (nameSimilarity > 0.75) {
    confidence += 40
  } else if (nameSimilarity > 0.55) {
    confidence += 25
  } else if (nameSimilarity > 0.35) {
    confidence += 10
  } else {
    // Very low name similarity — allow price/qty/date to carry the match.
    // No early return: three exact matches on date+price+qty (max 90 pts) is
    // strong enough evidence even without a name signal.
    confidence += 0
  }

  // 2. DATE MATCHING: ±3 days is realistic (20-40 points)
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
    // More than 7 days apart is too much
    return 0
  }

  // 3. PRICE MATCHING: ±5 cents for tolerance (15-30 points)
  // Weight/variable-price items in the AVIS often show 0,00 € as unit price
  // (the actual price is only known once the item is weighed at pick-up).
  // In that case, skip the price check entirely — name + date + qty are enough.
  if (avisItem.unitPrice === 0) {
    // No price signal available — grant partial points to avoid disqualifying
    confidence += 10
  } else {
    const priceDiff = Math.abs(avisItem.unitPrice - ebonItem.unitPrice)
    if (priceDiff <= 2) {
      confidence += 30
    } else if (priceDiff <= 5) {
      confidence += 20
    } else if (priceDiff <= 10) {
      confidence += 10
    } else {
      // Price differs too much
      return 0
    }
  }

  // 4. QUANTITY MATCHING (0-20 points)
  // Weight items (qty > 100) need different handling
  const isWeightItem = avisItem.qty > 10 || ebonItem.qty > 10

  if (!isWeightItem) {
    // For normal items, exact quantity match is strong
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
    // Weight items: only apply quantity points if very close
    if (avisItem.qty > 0 && ebonItem.qty > 0) {
      const qtyDiff = Math.abs(avisItem.qty - ebonItem.qty) / Math.max(avisItem.qty, ebonItem.qty)
      if (qtyDiff <= 0.05) {
        confidence += 15
      }
    }
  }

  return Math.min(100, confidence)
}
