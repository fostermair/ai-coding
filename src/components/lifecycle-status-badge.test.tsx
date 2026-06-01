import { describe, it, expect } from "vitest"
import { deriveStatus } from "./lifecycle-status-badge"

describe("deriveStatus", () => {
  it("returns 'hellofresh' when source is 'hellofresh'", () => {
    expect(deriveStatus({ source: "hellofresh", item_count: 5, is_virtual: 0 })).toBe("hellofresh")
  })

  it("returns 'hellofresh' even when other fields would indicate a different status", () => {
    expect(deriveStatus({ source: "hellofresh", item_count: 0, is_virtual: 1 })).toBe("hellofresh")
  })

  it("returns 'konto' when is_virtual is 1", () => {
    expect(deriveStatus({ is_virtual: 1, item_count: 5 })).toBe("konto")
  })

  it("returns 'konto' when item_count is 0 (Leer-Bon)", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 0 })).toBe("konto")
  })

  it("returns 'konto' when both is_virtual and item_count are 0", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 0 })).toBe("konto")
  })

  it("returns 'vollstaendig' when has_bestellung is 1", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 3, has_bestellung: 1 })).toBe("vollstaendig")
  })

  it("returns 'vollstaendig' when avis_status is 'complete'", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 3, avis_status: "complete" })).toBe("vollstaendig")
  })

  it("returns 'beleg' when item_count > 0 and no AVIS or Bestellung", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 5 })).toBe("beleg")
  })

  it("returns 'beleg' when avis_status is 'pending' (not vollstaendig)", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 5, avis_status: "pending" })).toBe("beleg")
  })

  it("returns 'beleg' when avis_status is 'no_matches'", () => {
    expect(deriveStatus({ is_virtual: 0, item_count: 5, avis_status: "no_matches" })).toBe("beleg")
  })

  it("returns 'konto' when is_virtual is undefined and item_count is 0 (fallback)", () => {
    expect(deriveStatus({ item_count: 0 })).toBe("konto")
  })
})
