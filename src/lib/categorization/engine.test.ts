import { describe, it, expect } from "vitest"
import { categorize, getAllCategories, getCategoryMeta } from "./engine"

describe("categorize()", () => {
  describe("Standard-Kategorien", () => {
    it("erkennt Milchprodukte via MILCH", () => {
      expect(categorize("ARLA MILCH 1,5%")).toBe("milchprodukte")
    })

    it("erkennt Milchprodukte via JOGH (Joghurt-Abkürzung)", () => {
      expect(categorize("ACTIMEL JOGH.")).toBe("milchprodukte")
      expect(categorize("BIO JOGH ERD/HIM")).toBe("milchprodukte")
    })

    it("erkennt Milchprodukte via GOUDA", () => {
      expect(categorize("JA! GOUDA JUNG")).toBe("milchprodukte")
    })

    it("erkennt Milchprodukte via EIER", () => {
      expect(categorize("10ER BIO EIER")).toBe("milchprodukte")
      expect(categorize("BIO EIER KL. M-L")).toBe("milchprodukte")
    })

    it("erkennt Brot & Backwaren via BROETCHEN", () => {
      expect(categorize("9 BAG.BROETCHEN")).toBe("brot")
    })

    it("erkennt Brot & Backwaren via BROT", () => {
      expect(categorize("VOLLKORNBROT DINKEL")).toBe("brot")
    })

    it("erkennt Obst via APFEL", () => {
      expect(categorize("GOLDEN DELICIOUS APFEL")).toBe("obst")
    })

    it("erkennt Obst via HEIDELBEERE (Pluralform)", () => {
      expect(categorize("HEIDELBEEREN 250G")).toBe("obst")
    })

    it("erkennt Gemüse via TOMATE", () => {
      expect(categorize("RISPENTOMATEN")).toBe("gemuese")
    })

    it("erkennt Gemüse via CHAMPIG (Champignon-Abkürzung)", () => {
      expect(categorize("CHAMP. WEISS 400G")).toBe("gemuese")
    })

    it("erkennt Fleisch via WUERST (Wurst-Abkürzung)", () => {
      expect(categorize("6 WIENER WUERST.")).toBe("fleisch")
    })

    it("erkennt Fleisch via HACK", () => {
      expect(categorize("HACKFLEISCH GEMISCHT")).toBe("fleisch")
    })

    it("erkennt Tiefkühl via TK-", () => {
      expect(categorize("TK-PIZZA SALAMI")).toBe("tiefkuehl")
    })

    it("erkennt Tiefkühl via BACKFISCH", () => {
      expect(categorize("BACKFISCHSTAEB. 450G")).toBe("tiefkuehl")
    })

    it("erkennt Getränke via COLA", () => {
      expect(categorize("COLA LIGHT 1,5L")).toBe("getraenke")
    })

    it("erkennt Getränke via WASSER", () => {
      expect(categorize("MINERALWASSER SPRUD")).toBe("getraenke")
    })

    it("erkennt Getränke via DIREKTSAFT", () => {
      expect(categorize("BIRNENDIREKTSAFT")).toBe("getraenke")
    })

    it("erkennt Süßwaren via SCHOKOLADE", () => {
      expect(categorize("RITTER SPORT SCHOKOLADE")).toBe("suesswaren")
    })

    it("erkennt Süßwaren via CINI-MINIS", () => {
      expect(categorize("CINI-MINIS CEREALIEN")).toBe("suesswaren")
    })

    it("erkennt Drogerie via ALWAYS", () => {
      expect(categorize("ALWAYS BP SLIPEINLAGE")).toBe("drogerie")
    })

    it("erkennt Drogerie via WASCHMITTEL", () => {
      expect(categorize("COLORWASCHMITTEL 20WL")).toBe("drogerie")
    })

    it("erkennt Pfand via PFAND", () => {
      expect(categorize("PFAND 0,25")).toBe("pfand")
    })

    it("erkennt Pfand via LEERGUT", () => {
      expect(categorize("LEERGUT MW E. ST")).toBe("pfand")
    })

    it("erkennt Tabak via ZIGARETTE", () => {
      expect(categorize("ZIGARETTEN")).toBe("tabak")
    })
  })

  describe("Fallback auf Sonstiges", () => {
    it("gibt sonstiges für unbekannte Produkte zurück", () => {
      expect(categorize("XXXUNBEKANNTES PRODUKT ZZZ")).toBe("sonstiges")
    })

    it("gibt niemals einen leeren String zurück", () => {
      const result = categorize("IRGENDWAS UNBEKANNT 999")
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    })

    it("gibt sonstiges für leere Strings zurück", () => {
      expect(categorize("")).toBe("sonstiges")
    })
  })

  describe("Case-insensitive Matching", () => {
    it("matcht case-insensitive (lowercase Input)", () => {
      expect(categorize("milch vollmilch")).toBe("milchprodukte")
    })

    it("matcht case-insensitive (Groß/Kleinschreibung gemischt)", () => {
      expect(categorize("Heidelbeeren")).toBe("obst")
    })
  })

  describe("Alias-Matching", () => {
    it("matcht gegen alias wenn raw_name nicht matcht", () => {
      expect(categorize("ALMIGHURT", "Joghurt Erdbeere")).toBe("milchprodukte")
    })

    it("matcht gegen raw_name bevorzugt vor alias", () => {
      expect(categorize("GOUDA 45%", "Irrelevanter Alias")).toBe("milchprodukte")
    })

    it("funktioniert ohne alias (alias undefined)", () => {
      expect(categorize("KAROTTEN 500G", undefined)).toBe("gemuese")
    })
  })

  describe("Regelreihenfolge (Priorität)", () => {
    it("Pfand hat höhere Priorität als andere Kategorien", () => {
      expect(categorize("PFAND MILCHFLASCHE")).toBe("pfand")
    })

    it("Tabak hat höhere Priorität als Süßwaren", () => {
      expect(categorize("TABAK SCHOKO ZIGARILLO")).toBe("tabak")
    })
  })
})

describe("getAllCategories()", () => {
  it("gibt 12 Standard-Kategorien zurück", () => {
    const cats = getAllCategories()
    expect(cats.length).toBe(12)
  })

  it("enthält sonstiges als Fallback-Kategorie", () => {
    const cats = getAllCategories()
    expect(cats.some((c) => c.slug === "sonstiges")).toBe(true)
  })

  it("enthält pfand als default-excluded Kategorie", () => {
    const cats = getAllCategories()
    const pfand = cats.find((c) => c.slug === "pfand")
    expect(pfand?.default_excluded_from_stats).toBe(true)
  })

  it("enthält tabak als default-excluded Kategorie", () => {
    const cats = getAllCategories()
    const tabak = cats.find((c) => c.slug === "tabak")
    expect(tabak?.default_excluded_from_stats).toBe(true)
  })

  it("enthält drogerie als default-excluded Kategorie", () => {
    const cats = getAllCategories()
    const drogerie = cats.find((c) => c.slug === "drogerie")
    expect(drogerie?.default_excluded_from_stats).toBe(true)
  })

  it("milchprodukte ist NICHT default-excluded", () => {
    const cats = getAllCategories()
    const milch = cats.find((c) => c.slug === "milchprodukte")
    expect(milch?.default_excluded_from_stats).toBe(false)
  })
})

describe("getCategoryMeta()", () => {
  it("gibt Metadaten für bekannte Kategorie zurück", () => {
    const meta = getCategoryMeta("milchprodukte")
    expect(meta).toBeDefined()
    expect(meta?.slug).toBe("milchprodukte")
    expect(meta?.label).toBeDefined()
  })

  it("gibt undefined für unbekannte Kategorie zurück", () => {
    const meta = getCategoryMeta("nichtexistent")
    expect(meta).toBeUndefined()
  })
})
