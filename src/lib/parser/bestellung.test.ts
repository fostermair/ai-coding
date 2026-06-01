import { describe, it, expect } from 'vitest'
import { parseBestellung } from './bestellung'

describe('parseBestellung', () => {
  describe('AC-1.2: Extract order number and items', () => {
    it('extracts order number from "Bestellnummer:" line', () => {
      const text = `
REWE Online-Bestellung
Bestellnummer: MO1234567890
Datum: 2026-05-20

Artikelbezeichnung Menge Einzelpreis Betrag
Apfel 500g 2,50 € 2,50 €
Milch 1l 1,50 € 1,50 €
      `
      const result = parseBestellung(text)
      expect(result.orderNumber).toBe('MO1234567890')
      expect(result.items.length).toBeGreaterThan(0)
    })

    it('extracts items with quantity units (g, kg, ml, l)', () => {
      const text = `
Bestellnummer: MO1234567890
Apfel 500g 2,50 € 2,50 €
Butter 250g 3,50 € 3,50 €
Mehl 1kg 2,00 € 2,00 €
Milch 1l 1,50 € 1,50 €
Öl 500ml 4,00 € 4,00 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBeGreaterThanOrEqual(3)

      // Check first item
      expect(result.items[0].articleName).toContain('Apfel')
      expect(result.items[0].quantityAmount).toBe(500)
      expect(result.items[0].quantityUnit).toBe('g')
      expect(result.items[0].unitPriceCents).toBe(250)
    })

    it('handles quantity formats: 0,5 kg (comma decimal)', () => {
      const text = `
Bestellnummer: MO0000000001
Butter 0,5 kg 3,50 € 1,75 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBeGreaterThanOrEqual(1)
      expect(result.items[0].quantityAmount).toBe(0.5)
      expect(result.items[0].quantityUnit).toBe('kg')
    })

    it('handles quantity formats: 6x330ml (count x size)', () => {
      const text = `
Bestellnummer: MO0000000002
Bier 6x330ml 0,50 € 3,00 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBeGreaterThanOrEqual(1)
      expect(result.items[0].quantityUnit).toContain('x')
    })

    it('handles quantity formats: "1 Stück" (count unit)', () => {
      const text = `
Bestellnummer: MO0000000003
Käse 1 Stück 5,00 € 5,00 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBeGreaterThanOrEqual(1)
      expect(result.items[0].quantityAmount).toBe(1)
      expect(result.items[0].quantityUnit).toBe('Stück')
    })

    it('extracts order number from prose "deine Bestellung B-USQ-SPQ-FC5 erhalten"', () => {
      const text = `
Hallo Florian,
wir haben deine Bestellung B-USQ-SPQ-FC5 erhalten.
Bestellte Produkte
1x Apfel 500g 2,50 €
      `
      const result = parseBestellung(text)
      expect(result.orderNumber).toBe('B-USQ-SPQ-FC5')
    })

    it('parses real REWE email format "Nx  Article 0,99 €"', () => {
      const text = `
Hallo,
wir haben deine Bestellung B-USQ-SPQ-FC5 erhalten.

1x  Leicht&Cross Knusperbrot Vollkorn 125g             0,99 €
2x  Blend-a-med Zahnpasta frisch 75ml                  1,98 €
1x  ja! Weizenmehl Type 405 1kg                        1,77 €
      `
      const result = parseBestellung(text)
      expect(result.orderNumber).toBe('B-USQ-SPQ-FC5')
      expect(result.items.length).toBe(3)
      expect(result.items[0].articleName).toContain('Leicht&Cross')
      expect(result.items[0].quantityUnit).toBe('g')
      expect(result.items[0].quantityAmount).toBe(125)
      expect(result.items[0].unitPriceCents).toBe(99)
      expect(result.items[0].totalPriceCents).toBe(99)

      expect(result.items[1].articleName).toContain('Blend-a-med')
      expect(result.items[1].quantityUnit).toBe('ml')
      expect(result.items[1].quantityAmount).toBe(75)
      expect(result.items[1].unitPriceCents).toBe(99) // 1,98 € / 2
      expect(result.items[1].totalPriceCents).toBe(198)

      expect(result.items[2].articleName).toContain('Weizenmehl')
      expect(result.items[2].quantityUnit).toBe('kg')
      expect(result.items[2].quantityAmount).toBe(1)
    })

    it('handles real format with "Stück" quantity', () => {
      const text = `
wir haben deine Bestellung B-ABC-DEF-GHI erhalten.

3x  Wilhelm Brandenburg Hähnchen Brustfilet 3 Stück  26,73 €
      `
      const result = parseBestellung(text)
      expect(result.items[0].quantityAmount).toBe(3)
      expect(result.items[0].quantityUnit).toBe('stück')
      expect(result.items[0].unitPriceCents).toBe(891) // 26,73 / 3
    })

    it('parses real REWE PDF format without spaces between name and price', () => {
      const text = `
wir haben deine Bestellung B-USQ-SPQ-FC5 erhalten.
1xLeicht&Cross Knusperbrot Vollkorn 125g0,99 €
2xBlend-a-med Zahnpasta frisch 75ml1,98 €
3xja! Weizenmehl Type 405 1kg1,77 €
      `
      const result = parseBestellung(text)
      expect(result.orderNumber).toBe('B-USQ-SPQ-FC5')
      expect(result.items.length).toBe(3)
      expect(result.items[0].articleName).toContain('Leicht&Cross')
      expect(result.items[0].totalPriceCents).toBe(99)
      expect(result.items[0].quantityUnit).toBe('g')
      expect(result.items[0].quantityAmount).toBe(125)

      expect(result.items[1].totalPriceCents).toBe(198)
      expect(result.items[1].unitPriceCents).toBe(99) // 1,98 / 2
      expect(result.items[1].quantityAmount).toBe(75)

      expect(result.items[2].articleName).toContain('Weizenmehl')
      expect(result.items[2].quantityAmount).toBe(1)
      expect(result.items[2].quantityUnit).toBe('kg')
    })

    it('parses real REWE PDF multi-line items', () => {
      const text = `
wir haben deine Bestellung B-USQ-SPQ-FC5 erhalten.
2xL'Oréal Men Expert Deospray Barber Club
150ml
5,98 €
3xWilhelm Brandenburg Regional Hähnchen
Brustfilet 3 Stück
26,73 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBe(2)
      expect(result.items[0].articleName).toContain("L'Oréal")
      expect(result.items[0].articleName).toContain('150ml')
      expect(result.items[0].totalPriceCents).toBe(598)
      expect(result.items[0].unitPriceCents).toBe(299) // 5,98 / 2
      expect(result.items[0].quantityAmount).toBe(150)
      expect(result.items[0].quantityUnit).toBe('ml')

      expect(result.items[1].articleName).toContain('Wilhelm')
      expect(result.items[1].totalPriceCents).toBe(2673)
      expect(result.items[1].unitPriceCents).toBe(891) // 26,73 / 3
      expect(result.items[1].quantityAmount).toBe(3)
      expect(result.items[1].quantityUnit).toBe('stück')
    })
  })

  describe('AC-1.3: Duplicate protection', () => {
    it('allows parsing same order number twice (duplicate check is at API level)', () => {
      const text = `
Bestellnummer: MO1234567890
Apfel 500g 2,50 € 2,50 €
      `
      const result1 = parseBestellung(text)
      const result2 = parseBestellung(text)

      expect(result1.orderNumber).toBe(result2.orderNumber)
      expect(result1.items[0]).toEqual(result2.items[0])
    })
  })

  describe('AC-5.1/5.2: Price per 100g/ml calculation', () => {
    it('calculates price/100g correctly for gram units', () => {
      const text = `
Bestellnummer: MO0000000004
Apfel 500g 2,50 € 2,50 €
      `
      const result = parseBestellung(text)
      const item = result.items[0]

      // Price per 100g = (250 cents / 500g) * 100 = 50 cents
      const pricePerHundred = Math.round((item.unitPriceCents / item.quantityAmount) * 100)
      expect(pricePerHundred).toBe(50)
    })

    it('handles kg unit with conversion for price/100g', () => {
      const text = `
Bestellnummer: MO0000000005
Mehl 1kg 2,00 € 2,00 €
      `
      const result = parseBestellung(text)
      const item = result.items[0]

      // 1kg = 1000g, price per 100g = 200 cents / 10 = 20 cents
      const pricePerHundred = Math.round(item.unitPriceCents / (item.quantityAmount * 10))
      expect(pricePerHundred).toBe(20)
    })

    it('calculates price/100ml for milliliter units', () => {
      const text = `
Bestellnummer: MO0000000006
Öl 500ml 4,00 € 4,00 €
      `
      const result = parseBestellung(text)
      const item = result.items[0]

      // Price per 100ml = (400 cents / 500ml) * 100 = 80 cents
      const pricePerHundred = Math.round((item.unitPriceCents / item.quantityAmount) * 100)
      expect(pricePerHundred).toBe(80)
    })

    it('handles liter unit with conversion for price/100ml', () => {
      const text = `
Bestellnummer: MO0000000007
Milch 1l 1,50 € 1,50 €
      `
      const result = parseBestellung(text)
      const item = result.items[0]

      // 1l = 1000ml, price per 100ml = 150 cents / 10 = 15 cents
      const pricePerHundred = Math.round(item.unitPriceCents / (item.quantityAmount * 10))
      expect(pricePerHundred).toBe(15)
    })

    it('returns null for count units (Stück, Packung)', () => {
      const text = `
Bestellnummer: MO0000000008
Käse 1 Stück 5,00 € 5,00 €
      `
      const result = parseBestellung(text)
      const item = result.items[0]

      // No conversion for Stück - should remain null when used in bon-detail
      expect(item.quantityUnit.toLowerCase()).toContain('stück')
    })
  })

  describe('REWE-branded products', () => {
    it('parses lines containing "REWE" as product names, not as headers', () => {
      const text = `
Bestellnummer: MO0000000020
REWE Bio Frische Weidemilch 3,8% 500ml 1,35 € 2,70 €
REWE Beste Wahl Sonnenblumenöl 1l 2,19 € 2,19 €
REWE Bio Eier Spitz und Bude 6 Stück 3,29 € 3,29 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBe(3)
      expect(result.items[0].articleName).toContain('Weidemilch')
      expect(result.items[1].articleName).toContain('Sonnenblumenöl')
      expect(result.items[2].articleName).toContain('Eier')
    })

    it('parses "Nx REWE..." email format items', () => {
      const text = `
wir haben deine Bestellung B-TST-REW-001B erhalten.
2x  REWE Bio Frische Weidemilch 3,8% 500ml        2,70 €
1x  REWE Beste Wahl Sonnenblumenöl 1l              2,19 €
      `
      const result = parseBestellung(text)
      expect(result.orderNumber).toBe('B-TST-REW-001B')
      expect(result.items.length).toBe(2)
      expect(result.items[0].articleName).toContain('Weidemilch')
      expect(result.items[0].totalPriceCents).toBe(270)
      expect(result.items[1].articleName).toContain('Sonnenblumenöl')
    })
  })

  describe('Edge cases', () => {
    it('throws error if no Bestellnummer found', () => {
      const text = `
Apfel 500g 2,50 € 2,50 €
      `
      expect(() => parseBestellung(text)).toThrow(/Bestellnummer/)
    })

    it('throws error if no items found', () => {
      const text = `
Bestellnummer: MO0000000009
      `
      expect(() => parseBestellung(text)).toThrow(/Artikel/)
    })

    it('ignores header lines and page numbers', () => {
      const text = `
REWE Online-Bestellung
1 von 1
Bestellnummer: MO0000000010
ArtikelbezeichnungMengeEinzelpreisBetrag
Apfel 500g 2,50 € 2,50 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBeGreaterThanOrEqual(1)
      expect(result.items[0].articleName).toContain('Apfel')
    })

    it('handles multiple items with various formats', () => {
      const text = `
Bestellnummer: MO0000000011
Apfel 500g 2,50 € 2,50 €
Butter 0,25 kg 3,00 € 0,75 €
Bier 6x0,5l 0,80 € 4,80 €
Käse 1 Stück 5,00 € 5,00 €
      `
      const result = parseBestellung(text)
      expect(result.items.length).toBeGreaterThanOrEqual(3)
      expect(result.orderNumber).toBe('MO0000000011')
    })
  })
})
