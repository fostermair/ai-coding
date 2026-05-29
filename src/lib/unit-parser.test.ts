import { describe, it, expect } from "vitest"
import { parseUnit } from "./unit-parser"

const PRICE = 200 // 2,00 € in cents — used as unitPriceCents

describe("parseUnit — Gramm", () => {
  it("250G", () => {
    const r = parseUnit("BUTTER LANDLIEBE 250G", PRICE)
    expect(r.normalized_amount).toBe(250)
    expect(r.normalized_unit).toBe("g")
    expect(r.price_per_unit_cents).toBe(Math.round((PRICE / 250) * 100))
  })

  it("250 G", () => {
    const r = parseUnit("BUTTER 250 G", PRICE)
    expect(r.normalized_amount).toBe(250)
    expect(r.normalized_unit).toBe("g")
  })

  it("250GR", () => {
    const r = parseUnit("QUARK 250GR", PRICE)
    expect(r.normalized_amount).toBe(250)
    expect(r.normalized_unit).toBe("g")
  })

  it("250 GR", () => {
    const r = parseUnit("KAESE 250 GR", PRICE)
    expect(r.normalized_amount).toBe(250)
    expect(r.normalized_unit).toBe("g")
  })
})

describe("parseUnit — Kilogramm", () => {
  it("1KG", () => {
    const r = parseUnit("ZUCKER 1KG", PRICE)
    expect(r.normalized_amount).toBe(1000)
    expect(r.normalized_unit).toBe("g")
  })

  it("0.5KG", () => {
    const r = parseUnit("MEHL 0.5KG", PRICE)
    expect(r.normalized_amount).toBe(500)
    expect(r.normalized_unit).toBe("g")
  })

  it("0,5KG (Komma-Dezimal)", () => {
    const r = parseUnit("MEHL 0,5KG", PRICE)
    expect(r.normalized_amount).toBe(500)
    expect(r.normalized_unit).toBe("g")
  })

  it("1,5KG", () => {
    const r = parseUnit("AEPFEL 1,5KG", PRICE)
    expect(r.normalized_amount).toBe(1500)
    expect(r.normalized_unit).toBe("g")
  })
})

describe("parseUnit — Milliliter", () => {
  it("500ML", () => {
    const r = parseUnit("MILCH 500ML", PRICE)
    expect(r.normalized_amount).toBe(500)
    expect(r.normalized_unit).toBe("ml")
  })

  it("500 ML", () => {
    const r = parseUnit("SAHNE 500 ML", PRICE)
    expect(r.normalized_amount).toBe(500)
    expect(r.normalized_unit).toBe("ml")
  })
})

describe("parseUnit — Liter", () => {
  it("1L", () => {
    const r = parseUnit("MILCH 1L", PRICE)
    expect(r.normalized_amount).toBe(1000)
    expect(r.normalized_unit).toBe("ml")
  })

  it("1 L", () => {
    const r = parseUnit("OJ 1 L", PRICE)
    expect(r.normalized_amount).toBe(1000)
    expect(r.normalized_unit).toBe("ml")
  })

  it("1LT", () => {
    const r = parseUnit("WASSER 1LT", PRICE)
    expect(r.normalized_amount).toBe(1000)
    expect(r.normalized_unit).toBe("ml")
  })

  it("1 LT", () => {
    const r = parseUnit("WASSER 1 LT", PRICE)
    expect(r.normalized_amount).toBe(1000)
    expect(r.normalized_unit).toBe("ml")
  })

  it("0,5L", () => {
    const r = parseUnit("SAFT 0,5L", PRICE)
    expect(r.normalized_amount).toBe(500)
    expect(r.normalized_unit).toBe("ml")
  })

  it("0.5L", () => {
    const r = parseUnit("SAFT 0.5L", PRICE)
    expect(r.normalized_amount).toBe(500)
    expect(r.normalized_unit).toBe("ml")
  })
})

describe("parseUnit — Stück", () => {
  it("6ST", () => {
    const r = parseUnit("EIER 6ST", 180)
    expect(r.normalized_amount).toBe(6)
    expect(r.normalized_unit).toBe("Stück")
    expect(r.price_per_unit_cents).toBe(30) // 180/6
  })

  it("6 ST", () => {
    const r = parseUnit("EIER 6 ST", 180)
    expect(r.normalized_amount).toBe(6)
    expect(r.normalized_unit).toBe("Stück")
  })

  it("6STK", () => {
    const r = parseUnit("JOGHURT 6STK", 360)
    expect(r.normalized_amount).toBe(6)
    expect(r.normalized_unit).toBe("Stück")
    expect(r.price_per_unit_cents).toBe(60)
  })

  it("6 STK", () => {
    const r = parseUnit("JOGHURT 6 STK", 360)
    expect(r.normalized_amount).toBe(6)
    expect(r.normalized_unit).toBe("Stück")
  })

  it("6X (keine Einheit)", () => {
    const r = parseUnit("MINIROLLS 6X", 300)
    expect(r.normalized_amount).toBe(6)
    expect(r.normalized_unit).toBe("Stück")
    expect(r.price_per_unit_cents).toBe(50)
  })
})

describe("parseUnit — Multi-Pack", () => {
  it("4X250G → 1000g", () => {
    const r = parseUnit("MARGARINE 4X250G", 800)
    expect(r.normalized_amount).toBe(1000)
    expect(r.normalized_unit).toBe("g")
    expect(r.price_per_unit_cents).toBe(80) // 800/1000*100 = 80
  })

  it("6X1L → 6000ml", () => {
    const r = parseUnit("WASSER 6X1L", 600)
    expect(r.normalized_amount).toBe(6000)
    expect(r.normalized_unit).toBe("ml")
    expect(r.price_per_unit_cents).toBe(10) // 600/6000*100 = 10
  })

  it("4X0,5KG → 2000g", () => {
    const r = parseUnit("MEHL 4X0,5KG", 800)
    expect(r.normalized_amount).toBe(2000)
    expect(r.normalized_unit).toBe("g")
  })
})

describe("parseUnit — Fallback NULL", () => {
  it("kein Pattern erkannt → alle NULL", () => {
    const r = parseUnit("BANANEN", PRICE)
    expect(r.normalized_amount).toBeNull()
    expect(r.normalized_unit).toBeNull()
    expect(r.price_per_unit_cents).toBeNull()
  })

  it("kurze Produktnamen ohne Einheit", () => {
    const r = parseUnit("BROT", PRICE)
    expect(r.normalized_amount).toBeNull()
  })
})

describe("parseUnit — Edge Cases", () => {
  it("negativer Preis (Pfand-Rückgabe) → kein Fehler", () => {
    const r = parseUnit("PFAND 250ML", -25)
    expect(r.normalized_amount).toBe(250)
    expect(r.normalized_unit).toBe("ml")
    expect(r.price_per_unit_cents).toBe(-10) // Math.round(-25/250*100)
  })

  it("price_per_unit_cents für 250g korrekt gerundet", () => {
    const r = parseUnit("BUTTER 250G", 199)
    expect(r.price_per_unit_cents).toBe(Math.round((199 / 250) * 100))
  })

  it("Dezimaltrennzeichen Komma: 0,5KG → 500g", () => {
    const r = parseUnit("PRODUKT 0,5KG", PRICE)
    expect(r.normalized_amount).toBe(500)
  })

  it("Dezimaltrennzeichen Punkt: 0.5L → 500ml", () => {
    const r = parseUnit("PRODUKT 0.5L", PRICE)
    expect(r.normalized_amount).toBe(500)
  })

  it("ST immer als Stück", () => {
    const r = parseUnit("TOMATEN 4ST", 199)
    expect(r.normalized_unit).toBe("Stück")
    expect(r.normalized_amount).toBe(4)
  })
})

describe("parseUnit — Preis-Berechnung", () => {
  it("g/ml: Math.round(unitPriceCents / amount * 100)", () => {
    const r = parseUnit("KAESE 200G", 349)
    expect(r.price_per_unit_cents).toBe(Math.round((349 / 200) * 100))
  })

  it("Stück: Math.round(unitPriceCents / amount)", () => {
    const r = parseUnit("EIER 10ST", 199)
    expect(r.price_per_unit_cents).toBe(Math.round(199 / 10))
  })
})

describe("parseUnit — Bug Fixes", () => {
  // BUG-1: STÜCK darf nicht als ST-Abkürzung gematcht werden
  it("BUG-1: '6 STÜCK' matcht nicht als Stück-Abkürzung", () => {
    const r = parseUnit("TOMATEN 6 STÜCK", PRICE)
    // Soll kein Match sein – "STÜCK" ist das deutsche Wort, kein Kürzel
    expect(r.normalized_unit).toBeNull()
    expect(r.normalized_amount).toBeNull()
  })

  it("BUG-1: '4STÜCK' matcht nicht", () => {
    const r = parseUnit("PAPRIKA 4STÜCK", PRICE)
    expect(r.normalized_unit).toBeNull()
  })

  it("BUG-1: '6 ST' (Kürzel) matcht weiterhin korrekt", () => {
    const r = parseUnit("EIER 6 ST", 180)
    expect(r.normalized_amount).toBe(6)
    expect(r.normalized_unit).toBe("Stück")
  })

  it("BUG-1: '12STK' (Kürzel) matcht weiterhin korrekt", () => {
    const r = parseUnit("JOGHURT 12STK", 360)
    expect(r.normalized_amount).toBe(12)
    expect(r.normalized_unit).toBe("Stück")
  })

  // BUG-2: Division durch Null wenn normalized_amount = 0
  it("BUG-2: '0G' → price_per_unit_cents ist null (kein Infinity)", () => {
    const r = parseUnit("PRODUKT 0G", 199)
    expect(r.normalized_amount).toBe(0)
    expect(r.normalized_unit).toBe("g")
    expect(r.price_per_unit_cents).toBeNull()
  })

  it("BUG-2: '0ML' → price_per_unit_cents ist null", () => {
    const r = parseUnit("PRODUKT 0ML", 199)
    expect(r.normalized_amount).toBe(0)
    expect(r.price_per_unit_cents).toBeNull()
  })
})
