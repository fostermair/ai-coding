/**
 * Unit tests for season classification logic (PROJ-14)
 *
 * Tests the classification algorithm:
 * - Günstig: avg <= min * 1.1
 * - Teuer: avg >= median * 1.1
 * - Normal: everything else
 */

import { describe, it, expect } from "vitest"

// ── Classification Function (must match frontend implementation) ──

function classifySeasons(prices: number[]): Map<number, string> {
  const result = new Map<number, string>()

  if (prices.length === 0) return result

  const min = Math.min(...prices)

  // Calculate median
  const sorted = [...prices].sort((a, b) => a - b)
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]

  // Classify each price
  for (let i = 0; i < prices.length; i++) {
    const avg = prices[i]

    if (avg <= min * 1.1) {
      result.set(i, "günstig")
    } else if (avg >= median * 1.1) {
      result.set(i, "teuer")
    } else {
      result.set(i, "normal")
    }
  }

  return result
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Season classification logic", () => {
  it("classifies prices as günstig/normal/teuer correctly", () => {
    const prices = [100, 150, 200] // min=100, median=150
    const result = classifySeasons(prices)

    // 100 <= 100 * 1.1 = 110 → günstig
    expect(result.get(0)).toBe("günstig")

    // 150: not <= 110, and 150 >= 150 * 1.1 = 165 is false → normal
    expect(result.get(1)).toBe("normal")

    // 200 >= 150 * 1.1 = 165 → teuer
    expect(result.get(2)).toBe("teuer")
  })

  it("all low prices classify as günstig", () => {
    const prices = [100, 105, 110]
    const result = classifySeasons(prices)

    // All should be günstig because all are <= 100 * 1.1 = 110
    expect(result.get(0)).toBe("günstig")
    expect(result.get(1)).toBe("günstig")
    expect(result.get(2)).toBe("günstig")
  })

  it("all high prices classify as teuer", () => {
    const prices = [500, 600, 700] // min=500, median=600
    const result = classifySeasons(prices)

    // All should be >= median * 1.1 = 660
    expect(result.get(0)).toBe("günstig") // 500 is min, so 500 <= 550
    expect(result.get(1)).toBe("normal") // 600: not <= 550 and not >= 660
    expect(result.get(2)).toBe("teuer") // 700 >= 660
  })

  it("flat prices (all same) classify as günstig", () => {
    const prices = [150, 150, 150]
    const result = classifySeasons(prices)

    // All prices are min = median, so all <= 150 * 1.1 = 165
    expect(result.get(0)).toBe("günstig")
    expect(result.get(1)).toBe("günstig")
    expect(result.get(2)).toBe("günstig")
  })

  it("single price returns günstig (min == avg)", () => {
    const prices = [100]
    const result = classifySeasons(prices)

    expect(result.get(0)).toBe("günstig")
  })

  it("two prices: lower is günstig, higher depends on threshold", () => {
    const prices = [100, 120] // min=100, median=110
    const result = classifySeasons(prices)

    // 100 <= 100 * 1.1 = 110 → günstig
    expect(result.get(0)).toBe("günstig")

    // 120: not <= 110, and 120 >= 110 * 1.1 = 121 is false → normal
    expect(result.get(1)).toBe("normal")
  })

  it("handles large price variations", () => {
    const prices = [10, 100, 1000] // min=10, median=100
    const result = classifySeasons(prices)

    // 10 <= 10 * 1.1 = 11 → günstig
    expect(result.get(0)).toBe("günstig")

    // 100: not <= 11, not >= 110 → normal
    expect(result.get(1)).toBe("normal")

    // 1000 >= 100 * 1.1 = 110 → teuer
    expect(result.get(2)).toBe("teuer")
  })

  it("empty price list returns empty map", () => {
    const prices: number[] = []
    const result = classifySeasons(prices)

    expect(result.size).toBe(0)
  })

  it("four prices with even distribution", () => {
    const prices = [100, 200, 300, 400] // min=100, median=250
    const result = classifySeasons(prices)

    // 100 <= 100 * 1.1 = 110 → günstig
    expect(result.get(0)).toBe("günstig")

    // 200: not <= 110, not >= 275 → normal
    expect(result.get(1)).toBe("normal")

    // 300: not <= 110, 300 >= 275 → teuer
    expect(result.get(2)).toBe("teuer")

    // 400 >= 275 → teuer
    expect(result.get(3)).toBe("teuer")
  })

  it("prices at boundary are classified correctly", () => {
    const prices = [100, 110, 111, 200] // min=100, median=110
    const result = classifySeasons(prices)

    // 100 <= 110 → günstig
    expect(result.get(0)).toBe("günstig")

    // 110 <= 110 → günstig
    expect(result.get(1)).toBe("günstig")

    // 111: not <= 110, not >= 121 → normal
    expect(result.get(2)).toBe("normal")

    // 200 >= 121 → teuer
    expect(result.get(3)).toBe("teuer")
  })
})
