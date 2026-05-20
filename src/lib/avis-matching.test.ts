import { describe, it, expect } from 'vitest'
import {
  levenshteinSimilarity,
  levenshteinDistance,
  tokenBasedSimilarity,
  normalizeProductName,
  computeMatchScore,
  calculateMatchConfidence,
} from './avis-matching'

describe('avis-matching utilities', () => {
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('abc', 'abc')).toBe(0)
    })

    it('returns length for completely different strings', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3)
      expect(levenshteinDistance('xyz', '')).toBe(3)
    })

    it('computes distance correctly for similar strings', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    })
  })

  describe('levenshteinSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(levenshteinSimilarity('abc', 'abc')).toBe(1.0)
    })

    it('returns high similarity for similar strings', () => {
      const similarity = levenshteinSimilarity('kitten', 'sitting')
      expect(similarity).toBeGreaterThan(0.5)
      expect(similarity).toBeLessThan(1.0)
    })

    it('returns low similarity for very different strings', () => {
      const similarity = levenshteinSimilarity('abc', 'xyz')
      expect(similarity).toBeLessThan(0.5)
    })
  })

  describe('normalizeProductName', () => {
    it('converts umlauts correctly', () => {
      expect(normalizeProductName('KÄSE')).toContain('kae')
      expect(normalizeProductName('MÜLLER')).toContain('mue')
      expect(normalizeProductName('ÜBER')).toContain('uebe')
      expect(normalizeProductName('GRÖßE')).toContain('groe')
    })

    it('removes common unit abbreviations (not numbers)', () => {
      const normalized1 = normalizeProductName('KÄSE 500G')
      expect(normalized1).toContain('kaese')
      expect(normalized1).not.toContain('500 ')  // Space after number is removed

      const normalized2 = normalizeProductName('WASSER 1L')
      expect(normalized2).toContain('wasser')

      const normalized3 = normalizeProductName('STÜCK KÄSE')
      expect(normalized3).not.toContain('stueck')
      expect(normalized3).toContain('kaese')
    })

    it('normalizes whitespace', () => {
      expect(normalizeProductName('KÄSE   500G')).toBe(normalizeProductName('KÄSE 500G'))
    })

    it('converts to lowercase', () => {
      const result = normalizeProductName('KÄSE')
      expect(result).toBe(result.toLowerCase())
    })
  })

  describe('tokenBasedSimilarity', () => {
    it('matches exact tokens', () => {
      const similarity = tokenBasedSimilarity('tilsiter jung 500g', 'tilsiter jung 500g')
      expect(similarity).toBe(1.0)
    })

    it('handles abbreviations in eBon', () => {
      // AVIS: "gefluegel" vs eBon: "gefl" (abbreviated)
      const similarity = tokenBasedSimilarity('gefluegel', 'gefl')
      expect(similarity).toBeGreaterThan(0.5)
    })

    it('handles partial matching', () => {
      const similarity = tokenBasedSimilarity('tilsiter jung', 'tilsiter')
      expect(similarity).toBeGreaterThan(0.5)
    })

    it('returns 0 for completely different tokens', () => {
      const similarity = tokenBasedSimilarity('abc def', 'xyz uvw')
      expect(similarity).toBe(0)
    })
  })

  describe('computeMatchScore', () => {
    it('returns 100 for identical names', () => {
      const score = computeMatchScore('TILSITER JUNG 500G', 'TILSITER JUNG 500G')
      expect(score).toBe(100)
    })

    it('returns high score for very similar names', () => {
      const score = computeMatchScore('TILSITER JUNG 500G', 'TILSIT JNG 500G')
      expect(score).toBeGreaterThan(80)
    })

    it('returns lower score for moderately similar names', () => {
      const score = computeMatchScore('TILSITER JUNG', 'BUTTERKÄSE MILD')
      expect(score).toBeLessThan(60)
    })
  })

  describe('calculateMatchConfidence', () => {
    const avisItem = { qty: 1, unitPrice: 199, name: 'TILSITER JUNG 500G' }
    const ebonItem = {
      qty: 1,
      unitPrice: 199,
      rawName: 'TILSIT JNG 500G',
      date: '2026-05-20',
    }
    const avisDate = '2026-05-20'

    it('returns max 100 confidence', () => {
      const confidence = calculateMatchConfidence(avisItem, ebonItem, avisDate)
      expect(confidence).toBeLessThanOrEqual(100)
    })

    it('returns 0 when dates are > 7 days apart', () => {
      const ebonItemFarDate = { ...ebonItem, date: '2026-06-05' }
      const confidence = calculateMatchConfidence(avisItem, ebonItemFarDate, avisDate)
      expect(confidence).toBe(0)
    })

    it('returns 0 when prices differ too much (> 10 cents)', () => {
      const avisItemHighPrice = { ...avisItem, unitPrice: 250 }
      const confidence = calculateMatchConfidence(avisItemHighPrice, ebonItem, avisDate)
      expect(confidence).toBe(0)
    })

    it('gives high confidence for exact match', () => {
      const avisItemExact = { qty: 1, unitPrice: 199, name: 'TILSITER JUNG' }
      const ebonItemExact = {
        qty: 1,
        unitPrice: 199,
        rawName: 'TILSITER JUNG',
        date: '2026-05-20',
      }
      const confidence = calculateMatchConfidence(avisItemExact, ebonItemExact, avisDate)
      expect(confidence).toBeGreaterThan(80)
    })

    it('handles weight items differently (qty > 10)', () => {
      const avisWeight = { qty: 250, unitPrice: 199, name: 'KÄSE' }
      const ebonWeight = {
        qty: 240,
        unitPrice: 199,
        rawName: 'KÄSE',
        date: '2026-05-20',
      }
      const confidence = calculateMatchConfidence(avisWeight, ebonWeight, avisDate)
      expect(confidence).toBeGreaterThan(0)
    })
  })
})
