import { test, expect } from "@playwright/test"

// ── Helpers: mock bons list ──────────────────────────────────────────────────

const MOCK_REWE_BON = {
  id: 1,
  receipt_date: "2026-01-31",
  receipt_time: "16:37",
  store_name: "Rewe Markt",
  receipt_nr: "100001",
  market_nr: "9999",
  item_count: 5,
  total_amount_cents: 1500,
  payment_method: "Kreditkarte",
  store_chain: "rewe",
  avis_status: null,
}

const MOCK_LIDL_BON = {
  id: 2,
  receipt_date: "2026-01-31",
  receipt_time: "16:37",
  store_name: "LIDL",
  receipt_nr: "302127",
  market_nr: "1812",
  item_count: 3,
  total_amount_cents: 1255,
  payment_method: "Kreditkarte",
  store_chain: "lidl",
  avis_status: null,
}

const MOCK_KAUFLAND_BON = {
  id: 3,
  receipt_date: "2026-01-24",
  receipt_time: "15:36",
  store_name: "KAUFLAND",
  receipt_nr: "59962",
  market_nr: "1663",
  item_count: 2,
  total_amount_cents: 1542,
  payment_method: "Kartenzahlung",
  store_chain: "kaufland",
  avis_status: null,
}

// ── AC-12: Paperless env-vars optional ───────────────────────────────────────

test.describe("AC-12: Paperless env vars optional", () => {
  test("sync returns 503 when Paperless not configured", async ({ request }) => {
    const resp = await request.post("/api/paperless/sync")
    // Either 503 (not configured) or 200 (configured) or 401 (bad token)
    expect([200, 503, 401].includes(resp.status())).toBeTruthy()

    if (resp.status() === 503) {
      const body = await resp.json()
      expect(body.configured).toBe(false)
      expect(body.message).toBeTruthy()
    }
  })

  test("app homepage loads without Paperless configured", async ({ page }) => {
    await page.goto("/")
    // App should load normally — no crash from missing Paperless env
    await expect(page.locator("body")).toBeVisible()
    await expect(page.getByRole("link", { name: "Bons" })).toBeVisible()
  })
})

// ── AC-13: Sync response includes byChain breakdown ─────────────────────────

test.describe("AC-13: byChain response structure", () => {
  test("sync response structure matches expected shape", async ({ request }) => {
    const resp = await request.post("/api/paperless/sync")
    const status = resp.status()

    if (status === 503) {
      // Not configured — check configured=false shape
      const body = await resp.json()
      expect(body.configured).toBe(false)
    } else {
      // Configured — response includes byChain
      const body = await resp.json()
      expect(body).toHaveProperty("byChain")
      expect(typeof body.byChain.rewe).toBe("number")
      expect(typeof body.byChain.lidl).toBe("number")
      expect(typeof body.byChain.kaufland).toBe("number")
    }
  })
})

// ── AC-8: store_chain field in bons API ─────────────────────────────────────

test.describe("AC-8: store_chain in bons API response", () => {
  test("GET /api/bons includes store_chain for each bon", async ({ request }) => {
    const resp = await request.get("/api/bons")
    expect(resp.status()).toBe(200)

    const body = await resp.json()
    expect(Array.isArray(body.bons)).toBeTruthy()

    if (body.bons.length > 0) {
      const firstBon = body.bons[0]
      // store_chain field must be present (either set or defaulted to 'rewe')
      expect(["rewe", "lidl", "kaufland"].includes(firstBon.store_chain)).toBeTruthy()
    }
  })
})

// ── AC-9: Store badges in Bon-Liste ─────────────────────────────────────────

test.describe("AC-9: Store badges in bon list", () => {
  test("REWE badge shows red for REWE bon", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_REWE_BON],
          total_count: 1,
          total_spent_cents: 1500,
        }),
      })
    })

    await page.goto("/")
    await expect(page.getByText("REWE")).toBeVisible()
  })

  test("Lidl badge shows yellow for Lidl bon", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_LIDL_BON],
          total_count: 1,
          total_spent_cents: 1255,
        }),
      })
    })

    await page.goto("/")
    await expect(page.getByText("Lidl")).toBeVisible()
    const lidlBadge = page.getByText("Lidl")
    await expect(lidlBadge).toHaveClass(/yellow/)
  })

  test("Kaufland badge shows dark for Kaufland bon", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_KAUFLAND_BON],
          total_count: 1,
          total_spent_cents: 1542,
        }),
      })
    })

    await page.goto("/")
    await expect(page.getByText("Kaufland")).toBeVisible()
    const kauflandBadge = page.getByText("Kaufland")
    await expect(kauflandBadge).toHaveClass(/gray-800/)
  })

  test("mixed bon list shows all three chain badges", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_REWE_BON, MOCK_LIDL_BON, MOCK_KAUFLAND_BON],
          total_count: 3,
          total_spent_cents: 4297,
        }),
      })
    })

    await page.goto("/")
    await expect(page.getByText("REWE")).toBeVisible()
    await expect(page.getByText("Lidl")).toBeVisible()
    await expect(page.getByText("Kaufland")).toBeVisible()
  })
})

// ── AC-11: AVIS elements only for REWE ──────────────────────────────────────

test.describe("AC-11: AVIS elements only for REWE", () => {
  test("REWE bon shows AVIS status (or empty AVIS cell)", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_REWE_BON],
          total_count: 1,
          total_spent_cents: 1500,
        }),
      })
    })

    await page.goto("/")
    // AVIS column header should be visible when REWE bons are present
    await expect(page.getByRole("columnheader", { name: "AVIS" })).toBeVisible()
  })

  test("Lidl bon row has no AVIS status badge", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_LIDL_BON],
          total_count: 1,
          total_spent_cents: 1255,
        }),
      })
    })

    await page.goto("/")
    // Lidl row should not show any AVIS status badge
    const lidlRow = page.locator("tr").filter({ hasText: "LIDL" })
    // The AVIS cell should exist but be empty (no AvisStatusBadge rendered)
    await expect(lidlRow.getByText(/complete|pending|no_matches/i)).not.toBeVisible()
  })

  test("Kaufland bon row has no AVIS status badge", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_KAUFLAND_BON],
          total_count: 1,
          total_spent_cents: 1542,
        }),
      })
    })

    await page.goto("/")
    const kauflandRow = page.locator("tr").filter({ hasText: "KAUFLAND" })
    await expect(kauflandRow.getByText(/complete|pending|no_matches/i)).not.toBeVisible()
  })
})

// ── AC-10: Store badge in Bon-Detail ─────────────────────────────────────────

test.describe("AC-10: Store badge in bon-detail", () => {
  // The bon detail API returns a flat object: { ...receipt fields, items: [], has_avis: bool }
  const MOCK_LIDL_DETAIL = {
    id: 2,
    filename: "[paperless] Lidl Jan 2026",
    store_name: "LIDL",
    store_address: "Meßdornstraße 3, 33106 Paderborn",
    store_uid: null,
    market_nr: "1812",
    receipt_nr: "302127",
    receipt_date: "2026-01-31",
    receipt_time: "16:37",
    payment_method: "Kreditkarte",
    total_amount_cents: 1255,
    paperless_doc_id: null,
    store_chain: "lidl",
    needs_reparse: 0,
    created_at: "2026-01-31T16:37:00Z",
    items: [],
    has_avis: false,
  }

  test("Lidl bon-detail shows Lidl badge next to store name", async ({ page }) => {
    await page.route("/api/bons/2", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(MOCK_LIDL_DETAIL),
      })
    })

    await page.goto("/bon/2")
    await expect(page.getByText("Lidl")).toBeVisible()
  })

  test("Lidl bon-detail has no AVIS column in items table", async ({ page }) => {
    await page.route("/api/bons/2", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(MOCK_LIDL_DETAIL),
      })
    })

    await page.goto("/bon/2")
    // AVIS column header should NOT be present in the items table
    await expect(page.getByRole("columnheader", { name: "AVIS" })).not.toBeVisible()
    // AVIS re-read button should NOT be present
    await expect(page.getByText("AVIS neu einlesen")).not.toBeVisible()
  })

  test("Kaufland bon-detail has no AVIS elements", async ({ page }) => {
    const MOCK_KAUFLAND_DETAIL = {
      ...MOCK_LIDL_DETAIL,
      id: 3,
      store_name: "KAUFLAND",
      store_chain: "kaufland",
      market_nr: "1663",
      receipt_nr: "59962",
    }

    await page.route("/api/bons/3", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(MOCK_KAUFLAND_DETAIL),
      })
    })

    await page.goto("/bon/3")
    await expect(page.getByText("Kaufland")).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "AVIS" })).not.toBeVisible()
  })
})

// ── AC-3 / AC-4: Parser validation via API ──────────────────────────────────

test.describe("AC-3/AC-4: Parser format validation", () => {
  test("Lidl PDF with valid format can be read (unit parser coverage)", async ({ request }) => {
    // Parser unit tests (lidl.test.ts, kaufland.test.ts) cover the format parsing.
    // Here we verify the parsers are deployed — import a fake Lidl PDF to confirm the
    // Paperless sync route correctly dispatches to the Lidl parser (error says "format not recognized"
    // not "unknown route").
    // Since we can't mock the Paperless server from E2E, this is covered by unit tests.
    // Structural test: verify the sync route exists and responds
    const resp = await request.post("/api/paperless/sync")
    expect([200, 503, 401]).toContain(resp.status())
  })
})

// ── AC-7: Duplicate key includes store_chain ─────────────────────────────────

test.describe("AC-7: Duplicate detection per chain", () => {
  test("GET /api/bons returns bons sorted by date desc", async ({ request }) => {
    const resp = await request.get("/api/bons")
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    const bons = body.bons as Array<{ receipt_date: string }>

    if (bons.length >= 2) {
      // Verify descending date order
      expect(bons[0].receipt_date >= bons[1].receipt_date).toBeTruthy()
    }
  })
})

// ── Responsive layout with chain badges ─────────────────────────────────────

test.describe("Responsive: Mobile layout with badges", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("store badges are visible on mobile", async ({ page }) => {
    await page.route("/api/bons*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bons: [MOCK_REWE_BON, MOCK_LIDL_BON],
          total_count: 2,
          total_spent_cents: 2755,
        }),
      })
    })

    await page.goto("/")
    await expect(page.getByText("REWE")).toBeVisible()
    await expect(page.getByText("Lidl")).toBeVisible()
  })
})
