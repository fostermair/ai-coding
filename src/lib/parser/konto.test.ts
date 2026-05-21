import { describe, it, expect } from "vitest"
import { parseKontoauszug } from "./konto"
import fs from "fs"
import path from "path"

const AUSZUG = fs.readFileSync(
  path.join(process.cwd(), "data/konto/Auszug.txt"),
  "utf-8"
)

describe("parseKontoauszug", () => {
  it("extracts IBAN and Periode from header", () => {
    const result = parseKontoauszug(AUSZUG)
    expect(result.konto_iban).toBe("DE78500240249610825030")
    expect(result.periode).toBe("2026-05")
    expect(result.kontoinhaber).toBeTruthy()
  })

  it("parses all transactions from Auszug.txt (16 total)", () => {
    const result = parseKontoauszug(AUSZUG)
    // 14 on page 1 + 2 in columnar section on page 2
    expect(result.transactions.length).toBe(16)
  })

  it("parses a Kartenzahlung correctly", () => {
    const result = parseKontoauszug(AUSZUG)
    const kaufland = result.transactions.find(
      (t) => t.haendler_name === "KAUFLAND PADERBORN 470"
    )
    expect(kaufland).toBeDefined()
    expect(kaufland?.buchungsdatum).toBe("2026-05-19")
    expect(kaufland?.valutadatum).toBe("2026-05-19")
    expect(kaufland?.typ).toBe("kartenzahlung")
    expect(kaufland?.betrag_cents).toBe(-4908)
    expect(kaufland?.iban).toBeNull()
  })

  it("parses a Kartenzahlung with hyphen in merchant name", () => {
    const result = parseKontoauszug(AUSZUG)
    const rewe = result.transactions.find(
      (t) => t.betrag_cents === -6662 && t.buchungsdatum === "2026-05-19"
    )
    expect(rewe).toBeDefined()
    expect(rewe?.haendler_name).toBe("REWE-Markt Saal oHG")
  })

  it("parses an Echtzeitüberweisung correctly", () => {
    const result = parseKontoauszug(AUSZUG)
    const uw = result.transactions.find(
      (t) => t.typ === "überweisung" && t.betrag_cents === -1500
    )
    expect(uw).toBeDefined()
    expect(uw?.buchungsdatum).toBe("2026-05-06")
    expect(uw?.empfaenger_name).toBe("Gilde XY")
    expect(uw?.verwendungszweck).toBe("Rewe")
    expect(uw?.iban).toBe("DE12500105175428585633")
    expect(uw?.bic).toBe("INGDDEFFXXX")
  })

  it("parses the large Überweisung (84,00 €)", () => {
    const result = parseKontoauszug(AUSZUG)
    const uw = result.transactions.find(
      (t) => t.typ === "überweisung" && t.betrag_cents === -8400
    )
    expect(uw).toBeDefined()
    expect(uw?.buchungsdatum).toBe("2026-05-04")
    expect(uw?.empfaenger_name).toBe("Gilde XY")
    expect(uw?.iban).toBe("DE12500105175428585633")
  })

  it("parses columnar-section transactions (page 2)", () => {
    const result = parseKontoauszug(AUSZUG)
    const baeckerei = result.transactions.find(
      (t) => t.haendler_name?.includes("Baeckerei") || t.haendler_name?.includes("Goeken")
    )
    expect(baeckerei).toBeDefined()
    expect(baeckerei?.buchungsdatum).toBe("2026-05-01")
    expect(baeckerei?.betrag_cents).toBe(-445)

    const reweSmall = result.transactions.find(
      (t) => t.betrag_cents === -411 && t.buchungsdatum === "2026-05-01"
    )
    expect(reweSmall).toBeDefined()
  })

  it("has no parse errors on the sample file", () => {
    const result = parseKontoauszug(AUSZUG)
    expect(result.parseErrors).toHaveLength(0)
  })

  it("throws on unrecognized format", () => {
    expect(() => parseKontoauszug("Not a bank statement")).toThrow(
      "Kontoauszug-Format nicht erkannt"
    )
  })

  it("correctly parses betrag_cents (German number format)", () => {
    const text = [
      "Max Mustermann",
      "IBAN: DE78500240249610825030",
      "Vorläufiger Kontoauszug 01/2026",
      "Transaktionsübersicht",
      "Buchung Valuta Transaktionsinformation Betrag",
      "15.01. 15.01. Kartenzahlung",
      "EDEKA NORD-1.234,56 €",
    ].join("\n")

    const result = parseKontoauszug(text)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].betrag_cents).toBe(-123456)
  })

  it("handles year overflow: December date in January statement", () => {
    const text = [
      "Max Mustermann",
      "IBAN: DE78500240249610825030",
      "Vorläufiger Kontoauszug 01/2026",
      "Transaktionsübersicht",
      "Buchung Valuta Transaktionsinformation Betrag",
      "31.12. 31.12. Kartenzahlung",
      "REWE-49,00 €",
    ].join("\n")

    const result = parseKontoauszug(text)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].buchungsdatum).toBe("2025-12-31")
  })

  it("correctly identifies all typ values", () => {
    const result = parseKontoauszug(AUSZUG)
    const types = new Set(result.transactions.map((t) => t.typ))
    expect(types.has("kartenzahlung")).toBe(true)
    expect(types.has("überweisung")).toBe(true)
    // No gutschrift or sonstige in the sample
  })

  it("returns transactions sorted by appearance (first in file = index 0)", () => {
    const result = parseKontoauszug(AUSZUG)
    expect(result.transactions[0].buchungsdatum).toBe("2026-05-19")
  })

  it("parses real pdf-parse output (no spaces between fields, amount on own line)", () => {
    const realPdfText = [
      "33106 Paderborn",
      "1 Essen",
      "Pocket",
      "IBAN: ",
      "BIC: DEFFDEFFXXX",
      "Vorläufiger Kontoauszug 05/2026",
      "01.05.2026 - 21.05.2026",
      "Kontostand 217,48 €",
      "Transaktionsübersicht",
      "BuchungValutaTransaktionsinformationBetrag",
      "19.05.19.05.Kartenzahlung",
      "KAUFLAND PADERBORN 470",
      "-49,08 €",
      "06.05.06.05.Echtzeitüberweisung",
      " Bee",
      "Rewe",
      "IBAN:  / BIC: INGDDEFFXXX",
      "-15,00 €",
      "01.05.01.05.Kartenzahlung",
      "Baeckerei  Goeken",
      "-4,45 €",
    ].join("\n")

    const result = parseKontoauszug(realPdfText)
    expect(result.parseErrors).toHaveLength(0)
    expect(result.transactions).toHaveLength(3)

    const kaufland = result.transactions[0]
    expect(kaufland.haendler_name).toBe("KAUFLAND PADERBORN 470")
    expect(kaufland.betrag_cents).toBe(-4908)
    expect(kaufland.typ).toBe("kartenzahlung")

    const uw = result.transactions[1]
    expect(uw.typ).toBe("überweisung")
    expect(uw.betrag_cents).toBe(-1500)
    expect(uw.empfaenger_name).toBe("Bee")
    expect(uw.verwendungszweck).toBe("Rewe")
    expect(uw.bic).toBe("INGDDEFFXXX")

    const baeckerei = result.transactions[2]
    expect(baeckerei.haendler_name).toBe("Baeckerei  Goeken")
    expect(baeckerei.betrag_cents).toBe(-445)
  })

  it("does not throw when IBAN line is empty (falls back to UNKNOWN)", () => {
    const text = [
      "IBAN: ",
      "Vorläufiger Kontoauszug 05/2026",
    ].join("\n")
    const result = parseKontoauszug(text)
    expect(result.konto_iban).toBe("UNKNOWN")
    expect(result.periode).toBe("2026-05")
  })
})
