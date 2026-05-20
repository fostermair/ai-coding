import { describe, it, expect } from "vitest"
import { parseKauflandEbon } from "./kaufland"

describe("parseKauflandEbon", () => {
  it("should parse a valid Kaufland eBon", () => {
    const text = `Riemekestraße 37
33102 Paderborn
Tel. 05251/1840530
DE814490558
Preis EUR
GS Grissini 100g
 2 * 0,69 1,38 B
KLC.Spaghetti 4 * 0,69 2,76 B
Summe 154,20
Kartenzahlung 154,20
Kaufland Card: xxxxx4392
Datum:24.01.26 Zeit: 15:36 Uhr Bon:59962
Filiale: 1663 Kasse: 7`

    const result = parseKauflandEbon(text)

    expect(result.storeName).toBe("KAUFLAND")
    expect(result.storeAddress).toContain("Riemekestraße")
    expect(result.marketNr).toBe("1663")
    expect(result.receiptNr).toBe("59962")
    expect(result.receiptDate).toBe("2026-01-24")
    expect(result.receiptTime).toBe("15:36")
    expect(result.storeChain).toBe("kaufland")
    expect(result.totalAmountCents).toBe(15420)
  })

  it("should parse items with quantity and price", () => {
    const text = `Kaufland
Strasse 1
Preis EUR
GS Grissini 100g 2 * 0,69 1,38 B
Summe 1,38
Kartenzahlung 1,38
Datum:24.01.26 Zeit: 15:36 Uhr Bon:12345
Filiale: 100 Kasse: 1`

    const result = parseKauflandEbon(text)
    const item = result.items[0]

    expect(item.rawName).toContain("Grissini")
    expect(item.quantity).toBe(2)
    expect(item.totalPriceCents).toBe(138)
  })

  it("should parse weight quantities", () => {
    const text = `Kaufland
Strasse 1
EUR
Bananen 1,190 kg 1,54 B
Summe 1,54
Kartenzahlung 1,54
Datum:24.01.26 Zeit: 15:36 Uhr Bon:12345
Filiale: 100 Kasse: 1`

    const result = parseKauflandEbon(text)
    const item = result.items[0]

    expect(item.rawName).toContain("Bananen")
    expect(item.quantity).toBe(1.19)
    expect(item.totalPriceCents).toBe(154)
  })

  it("should throw on invalid format", () => {
    const invalidText = "This is not a Kaufland eBon"
    expect(() => parseKauflandEbon(invalidText)).toThrow()
  })
})
