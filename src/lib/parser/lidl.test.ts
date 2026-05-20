import { describe, it, expect } from "vitest"
import { parseLidlEbon } from "./lidl"

describe("parseLidlEbon", () => {
  it("should parse a valid Lidl eBon", () => {
    const text = `LIDL
Meßdornstraße 3
33106 Paderborn
EUR
Trauben dunkel 2,19 A
Preisvorteil -0,20
Heidelbeeren 3,99 x 2 7,98 A
Sodergarden gesalzen 1,29 x 2 2,58 A
Preisvorteil -0,40
zu zahlen 12,55
Kreditkarte 12,55
1812 302127/01 31.01.26 16:37`

    const result = parseLidlEbon(text)

    expect(result.storeName).toBe("LIDL")
    expect(result.storeAddress).toContain("Meßdornstraße")
    expect(result.marketNr).toBe("1812")
    expect(result.receiptNr).toBe("302127")
    expect(result.receiptDate).toBe("2026-01-31")
    expect(result.receiptTime).toBe("16:37")
    expect(result.storeChain).toBe("lidl")
    expect(result.totalAmountCents).toBe(1255)
    expect(result.items.length).toBeGreaterThan(0)

    // Check first item
    const firstItem = result.items.find((i) => i.rawName.includes("Trauben"))
    expect(firstItem).toBeDefined()
    expect(firstItem?.quantity).toBe(1)
    expect(firstItem?.unitPriceCents).toBe(219)
    expect(firstItem?.discounts.length).toBe(1)
  })

  it("should handle items with quantity", () => {
    const text = `LIDL
Test Store
EUR
Heidelbeeren 3,99 x 2 7,98 A
zu zahlen 7,98
Kreditkarte 7,98
1234 567890/01 01.01.26 10:00`

    const result = parseLidlEbon(text)
    const item = result.items[0]

    expect(item.quantity).toBe(2)
    expect(item.unitPriceCents).toBe(399)
    expect(item.totalPriceCents).toBe(798)
  })

  it("should throw on invalid format", () => {
    const invalidText = "This is not a Lidl eBon"
    expect(() => parseLidlEbon(invalidText)).toThrow()
  })
})
