import { describe, it, expect } from "vitest"
import { parseReweEbon, formatGermanDate } from "./rewe"

// Minimal representative eBon text (covers all item types)
const EBON1_TEXT = `
 * Elsen - Mein Dorf *
 Rewe Markt Saal
 Dionysius Str. 5-13
 33106 Paderborn-Elsen
 * Heimatshopping *
**************************************
 UID Nr.: DE233937214
 EUR
GRAND RAFFEALLO 5,59 B
 Weihn. Sueßwaren 50% -2,80 B
GOUDA GER. 48% 3,58 B
 2 Stk x 1,79
SAMMYS SANDWICH 4,98 B
 2 Stk x 2,49
CHERRY ROMA BIO 1,29 B
TRANSPORTBOX ABH 40,00 A *
 5 Stk x 8,00
LEERG. MW E. ST -10,89 B *
LEERG. EW E. ST -8,75 B *
 35 Stk x 0,25
TRANSPORTBOX ABH -8,00 A *
 --------------------------------------
 SUMME EUR -38,29
 ======================================
 Geg. BAR EUR -38,29

 Steuer % Netto Steuer Brutto
 A= 19,0% -33,61 -6,39 -40,00
 B= 7,0% 1,60 0,11 1,71

TSE-Signatur: abc123
 TSE-Signaturzähler: 5579205
 TSE-Transaktion: 2714280
 TSE-Start: 2025-12-29T12:05:01.000
 TSE-Stop: 2025-12-29T12:07:57.000
 Seriennnummer Kasse: REWE:74:56:3c:82:c2:3d:00
 29.12.2025 12:07 Bon-Nr.:4546
 Markt:6857 Kasse:6 Bed.:171717
`

const EBON2_CONCESSION_TEXT = `
 * Elsen - Mein Dorf *
 Rewe Markt Saal
 Dionysius Str. 5-13
 33106 Paderborn-Elsen
 * Heimatshopping *
**************************************
 UID Nr.: DE233937214
 EUR
FRISCHFLEISCH X01 17,59 B *
MINI WIENER 2,99 B
HEIDELBEERE 3,57 B
 3 Stk x 1,19
APPLE-CHERRY 4,98 A
 2 Stk x 2,49
 --------------------------------------
 SUMME EUR 54,96
 ======================================
 Geg. Mastercard EUR 54,96

TSE-Signatur: xyz
 23.12.2025 17:17 Bon-Nr.:1936
 Markt:6857 Kasse:5 Bed.:432105
`

const EBON3_GETRAENKE_TEXT = `
 Rewe-Markt Saal
 Getränkemarkt
 Dionysiusstraße 6
 33106 Paderborn / Elsen
 05254-66427
**************************************
 Elsen - mein Dorf
 Heimatshopping
 UID Nr.: DE233937214
 EUR
GEROLST. MEDIUM 7,99 A
PFAND 3,30 EUR 3,30 A *
GEROLST. MEDIUM 15,98 A
 2 Stk x 7,99
PFAND 3,30 EUR 6,60 A *
 2 Stk x 3,30
LEERG. MW V. ST -0,45 A *
 3 Stk x 0,15
LEERGUT EINWEG -15,75 A *
 63 Stk x 0,25
 --------------------------------------
 SUMME EUR 26,32
 ======================================
 Geg. VISA EUR 26,32

TSE-Signatur: xyz
 30.09.2025 13:41 Bon-Nr.:7002
 Markt:6862 Kasse:1 Bed.:353535
`

const EBON4_MULTILINE_NAME_TEXT = `
 * Elsen - Mein Dorf *
 Rewe Markt Saal
 Dionysius Str. 5-13
 33106 Paderborn-Elsen
 * Heimatshopping *
**************************************
 UID Nr.: DE233937214
 EUR
HEFE-WEIZEN BIO
0 7,99 A
 2 Stk x 3,99
KÄSE GOUDA
1 4,50 B
CHOCOLATE BAR DARK
2 2,99 B
 3 Stk x 0,99
 --------------------------------------
 SUMME EUR 26,48
 ======================================
 Geg. BAR EUR 26,48

TSE-Signatur: abc
 29.12.2025 14:30 Bon-Nr.:5555
 Markt:6857 Kasse:3 Bed.:171717
`

// ── formatGermanDate ──────────────────────────────────────────────────────────

describe("formatGermanDate", () => {
  it("converts ISO date to German format", () => {
    expect(formatGermanDate("2025-12-29")).toBe("29.12.2025")
    expect(formatGermanDate("2025-09-30")).toBe("30.09.2025")
  })
})

// ── parseReweEbon – ebon1 ────────────────────────────────────────────────────

describe("parseReweEbon – ebon1 (basic, discounts, leergut)", () => {
  const result = parseReweEbon(EBON1_TEXT)

  it("extracts store name", () => {
    expect(result.storeName).toMatch(/Rewe/i)
  })

  it("extracts UID", () => {
    expect(result.storeUid).toBe("DE233937214")
  })

  it("extracts receipt metadata", () => {
    expect(result.receiptDate).toBe("2025-12-29")
    expect(result.receiptTime).toBe("12:07")
    expect(result.receiptNr).toBe("4546")
    expect(result.marketNr).toBe("6857")
    expect(result.paymentMethod).toBe("BAR")
  })

  it("extracts correct total (negative, Leergut Rückgabe)", () => {
    expect(result.totalAmountCents).toBe(-3829)
  })

  it("parses product with discount", () => {
    const grand = result.items.find((i) => i.rawName === "GRAND RAFFEALLO")
    expect(grand).toBeDefined()
    expect(grand!.totalPriceCents).toBe(559)
    expect(grand!.taxCode).toBe("B")
    expect(grand!.discounts).toHaveLength(1)
    expect(grand!.discounts[0].amountCents).toBe(-280)
    expect(grand!.discounts[0].description).toBe("Weihn. Sueßwaren 50%")
  })

  it("parses quantity line correctly", () => {
    const gouda = result.items.find((i) => i.rawName === "GOUDA GER. 48%")
    expect(gouda).toBeDefined()
    expect(gouda!.quantity).toBe(2)
    expect(gouda!.unitPriceCents).toBe(179)
    expect(gouda!.totalPriceCents).toBe(358)
  })

  it("recognises leergut items", () => {
    const leergut = result.items.filter((i) => i.itemType === "leergut")
    expect(leergut.length).toBeGreaterThan(0)
    leergut.forEach((l) => {
      expect(l.totalPriceCents).toBeLessThan(0) // Leergut is always negative
    })
  })

  it("handles bonus_excluded flag (*)", () => {
    const box = result.items.find((i) => i.rawName === "TRANSPORTBOX ABH")
    expect(box).toBeDefined()
    expect(box!.bonusExcluded).toBe(true)
  })

  it("recognises transportbox items as pfand type", () => {
    const boxes = result.items.filter((i) => i.itemType === "pfand")
    const transportbox = boxes.find((i) => i.rawName === "TRANSPORTBOX ABH")
    expect(transportbox).toBeDefined()
    expect(transportbox!.itemType).toBe("pfand")
  })
})

// ── parseReweEbon – ebon2 (concession) ───────────────────────────────────────

describe("parseReweEbon – ebon2 (concession items, card payment)", () => {
  const result = parseReweEbon(EBON2_CONCESSION_TEXT)

  it("extracts payment method", () => {
    expect(result.paymentMethod).toBe("Mastercard")
  })

  it("parses concession item", () => {
    const fleisch = result.items.find((i) => i.rawName === "FRISCHFLEISCH")
    expect(fleisch).toBeDefined()
    expect(fleisch!.itemType).toBe("concession")
    expect(fleisch!.concessionaireCode).toBe("X01")
    expect(fleisch!.bonusExcluded).toBe(true)
  })

  it("parses A tax code items", () => {
    const cherry = result.items.find((i) => i.rawName === "APPLE-CHERRY")
    expect(cherry).toBeDefined()
    expect(cherry!.taxCode).toBe("A")
    expect(cherry!.quantity).toBe(2)
    expect(cherry!.unitPriceCents).toBe(249)
  })
})

// ── parseReweEbon – ebon3 (Getränkemarkt, Pfand) ─────────────────────────────

describe("parseReweEbon – ebon3 (Getränkemarkt, Pfand, VISA)", () => {
  const result = parseReweEbon(EBON3_GETRAENKE_TEXT)

  it("extracts store name (Getränkemarkt)", () => {
    expect(result.storeName).toMatch(/Rewe/i)
  })

  it("extracts market number", () => {
    expect(result.marketNr).toBe("6862")
  })

  it("parses PFAND items as pfand type", () => {
    const pfand = result.items.filter((i) => i.itemType === "pfand")
    expect(pfand.length).toBeGreaterThan(0)
    pfand.forEach((p) => {
      expect(p.totalPriceCents).toBeGreaterThan(0)
      expect(p.bonusExcluded).toBe(true)
    })
  })

  it("parses LEERGUT EINWEG as leergut type", () => {
    const leergut = result.items.find((i) => i.rawName === "LEERGUT EINWEG")
    expect(leergut).toBeDefined()
    expect(leergut!.itemType).toBe("leergut")
    expect(leergut!.quantity).toBe(63)
    expect(leergut!.unitPriceCents).toBe(25)
  })

  it("parses GEROLST. with 2x quantity", () => {
    const items = result.items.filter((i) => i.rawName === "GEROLST. MEDIUM")
    const withQty = items.find((i) => i.quantity === 2)
    expect(withQty).toBeDefined()
    expect(withQty!.unitPriceCents).toBe(799)
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

// ── parseReweEbon – ebon4 (multiline names with numeric placeholders) ───────

describe("parseReweEbon – ebon4 (product names on separate lines from price)", () => {
  const result = parseReweEbon(EBON4_MULTILINE_NAME_TEXT)

  it("correctly parses name when separated from price line", () => {
    const hefe = result.items.find((i) => i.rawName === "HEFE-WEIZEN BIO")
    expect(hefe).toBeDefined()
    expect(hefe!.totalPriceCents).toBe(799)
    expect(hefe!.quantity).toBe(2)
    expect(hefe!.unitPriceCents).toBe(399)
  })

  it("does not store numeric placeholder '0' as product name", () => {
    const badItem = result.items.find((i) => i.rawName === "0")
    expect(badItem).toBeUndefined()
  })

  it("parses second product correctly", () => {
    const kaese = result.items.find((i) => i.rawName === "KÄSE GOUDA")
    expect(kaese).toBeDefined()
    expect(kaese!.totalPriceCents).toBe(450)
    expect(kaese!.taxCode).toBe("B")
  })

  it("parses third product with quantity", () => {
    const chocolate = result.items.find((i) => i.rawName === "CHOCOLATE BAR DARK")
    expect(chocolate).toBeDefined()
    expect(chocolate!.quantity).toBe(3)
    expect(chocolate!.unitPriceCents).toBe(99)
    expect(chocolate!.totalPriceCents).toBe(299)
  })

  it("total items count is correct", () => {
    expect(result.items).toHaveLength(3)
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("parseReweEbon – error handling", () => {
  it("throws on non-REWE text", () => {
    expect(() => parseReweEbon("Hello world")).toThrow("Format nicht erkannt")
  })

  it("throws on empty string", () => {
    expect(() => parseReweEbon("")).toThrow("Format nicht erkannt")
  })
})
