import { describe, it, expect } from "vitest"
import { parseAvis } from "./avis"

describe("AVIS Parser", () => {
  it("parses a sample AVIS with pickup date and items", () => {
    // Sample AVIS text based on spec format
    const avisText = `
      REWE Abholavis

      Abholtermin: 18.05.2026
      Bestellnummer: 123456789
      Markt: REWE Zentrum Hamburg

      LIEFERBAR

      Artikel                              Menge  Einzelpreis  Betrag  Liefermenge
      ─────────────────────────────────────────────────────────────────────────
      REWE Bio Karotten 500g                   1      1,99 €    1,99 €        1
      Vollmilch Frisch 1L                      2      1,49 €    2,98 €        2
      Kakaopulver 250g                         1      2,99 €    2,99 €        1

      NICHT LIEFERBAR

      Mozzarella gerieben 500g                 1      4,99 €    4,99 €        0

      ERSATZARTIKEL

      Joghurt 500g (Ersatz für Buttermilch)   1      1,99 €    1,99 €        1
    `

    const parsed = parseAvis(avisText)

    expect(parsed.pickupDate).toBe("2026-05-18")
    expect(parsed.orderNumber).toBe("123456789")
    expect(parsed.items.length).toBeGreaterThan(0)

    // Check that available items are parsed
    const availableItems = parsed.items.filter((i) => i.status === "available")
    expect(availableItems.length).toBeGreaterThan(0)

    // Check that unavailable items are parsed
    const unavailableItems = parsed.items.filter((i) => i.status === "unavailable")
    expect(unavailableItems.length).toBeGreaterThan(0)
  })

  it("throws error if no pickup date found", () => {
    const invalidText = `
      Bestellnummer: 123456789
      Some items
    `

    expect(() => parseAvis(invalidText)).toThrow(/Abholdatum/)
  })

  it("throws error if no order number found", () => {
    const invalidText = `
      Abholtermin: 18.05.2026
      Some items
    `

    expect(() => parseAvis(invalidText)).toThrow(/Bestellnummer/)
  })

  it("throws error if no items found", () => {
    const invalidText = `
      Abholtermin: 18.05.2026
      Bestellnummer: 123456789
      No items listed
    `

    expect(() => parseAvis(invalidText)).toThrow(/Artikel/)
  })

  it("handles weight items correctly", () => {
    const avisText = `
      Abholtermin: 18.05.2026
      Bestellnummer: 123456789

      LIEFERBAR

      Artikel                              Menge  Einzelpreis  Betrag  Liefermenge
      ─────────────────────────────────────────────────────────────────────────
      Knackwurst 400gg                       400      0,75 €  300,00 €       400gg
      Apfelkompott 250gg                     250      0,60 €  150,00 €       250gg
    `

    const parsed = parseAvis(avisText)
    expect(parsed.items.length).toBeGreaterThan(0)

    // Weight items should have quantities in the hundreds (grams)
    expect(parsed.items[0].qty).toBeGreaterThan(100)
  })

  it("parses Ersatzartikel with all-caps product name on its own line", () => {
    // Real-world pattern: substitute items appear as an all-caps name line
    // followed by a separate price line — e.g. "BANANE BANDEROLE\n1  0,89 €  0,89 €  1"
    const avisText = `
      Abholtermin: 11.05.2026
      Bestellnummer: B-434-2Y8-YB2

      LIEFERBAR

      Nutella 750g  3  3,79 €  11,37 €  3

      ERSATZARTIKEL

      BANANE BANDEROLE
      1  0,89 €  0,89 €  1
    `

    const parsed = parseAvis(avisText)
    const substitutes = parsed.items.filter((i) => i.status === "substitute")
    expect(substitutes.length).toBe(1)
    expect(substitutes[0].name).toContain("BANANE BANDEROLE")
    expect(substitutes[0].unitPrice).toBe(89)
  })

  it("parses prices in cents correctly", () => {
    const avisText = `
      Abholtermin: 18.05.2026
      Bestellnummer: 123456789

      LIEFERBAR

      Product A  1  1,99 €  1,99 €  1
      Product B  1  10,50 €  10,50 €  1
      Product C  1  0,99 €  0,99 €  1
    `

    const parsed = parseAvis(avisText)
    const items = parsed.items.filter((i) => i.status === "available")

    // Check that prices are converted to cents
    expect(items.some((i) => i.unitPrice === 199)).toBeTruthy()
    expect(items.some((i) => i.unitPrice === 1050)).toBeTruthy()
    expect(items.some((i) => i.unitPrice === 99)).toBeTruthy()
  })

})
