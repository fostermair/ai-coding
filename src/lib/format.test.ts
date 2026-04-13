import { describe, it, expect } from "vitest"
import { formatEuro, formatDate } from "./format"

describe("formatEuro", () => {
  it("formats positive cents", () => {
    expect(formatEuro(559)).toBe("5,59")
    expect(formatEuro(100)).toBe("1,00")
    expect(formatEuro(5496)).toBe("54,96")
  })

  it("formats negative cents", () => {
    expect(formatEuro(-3829)).toBe("-38,29")
    expect(formatEuro(-280)).toBe("-2,80")
  })

  it("formats zero", () => {
    expect(formatEuro(0)).toBe("0,00")
  })

  it("pads single-digit cents", () => {
    expect(formatEuro(5)).toBe("0,05")
    expect(formatEuro(9)).toBe("0,09")
  })
})

describe("formatDate", () => {
  it("converts ISO to German date format", () => {
    expect(formatDate("2025-12-29")).toBe("29.12.2025")
    expect(formatDate("2025-09-30")).toBe("30.09.2025")
  })

  it("preserves leading zeros", () => {
    expect(formatDate("2025-01-05")).toBe("05.01.2025")
  })
})
