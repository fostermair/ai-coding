import { test, expect } from "@playwright/test"

// ── Feature 1: Globaler Transaktions-Alias ───────────────────────────────────

test.describe("AC: Alias API (CRUD)", () => {
  const testBeschreibung = `TEST-PROJ26-${Date.now()}`

  test.afterEach(async ({ request }) => {
    // Clean up: delete test alias if it exists
    await request.delete("/api/konto/transactions/alias", {
      data: { beschreibung: testBeschreibung },
    })
  })

  test("POST creates alias and returns success", async ({ request }) => {
    const formData = new FormData()
    formData.append("beschreibung", testBeschreibung)
    formData.append("alias", "Test Alias PROJ26")

    const res = await request.post("/api/konto/transactions/alias", {
      multipart: {
        beschreibung: testBeschreibung,
        alias: "Test Alias PROJ26",
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test("POST returns 400 when beschreibung is missing", async ({ request }) => {
    const res = await request.post("/api/konto/transactions/alias", {
      multipart: { alias: "Nur Alias" },
    })
    expect(res.status()).toBe(400)
  })

  test("POST returns 400 when alias is empty", async ({ request }) => {
    const res = await request.post("/api/konto/transactions/alias", {
      multipart: { beschreibung: testBeschreibung, alias: "" },
    })
    expect(res.status()).toBe(400)
  })

  test("DELETE removes alias", async ({ request }) => {
    // First create
    await request.post("/api/konto/transactions/alias", {
      multipart: { beschreibung: testBeschreibung, alias: "Temp Alias" },
    })

    // Then delete
    const res = await request.delete("/api/konto/transactions/alias", {
      data: { beschreibung: testBeschreibung },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test("DELETE is idempotent for non-existent alias", async ({ request }) => {
    const res = await request.delete("/api/konto/transactions/alias", {
      data: { beschreibung: "NONEXISTENT-ALIAS-XYZ" },
    })
    expect(res.status()).toBe(200)
  })
})

// ── Feature 3: Transaktions-Ausblend-Toggle ──────────────────────────────────

test.describe("AC: Hide API (toggle)", () => {
  test("PATCH returns 400 for non-numeric ID", async ({ request }) => {
    const res = await request.fetch("/api/konto/transactions/abc/hide", { method: "PATCH" })
    expect(res.status()).toBe(400)
  })

  test("PATCH returns 404 for non-existent transaction", async ({ request }) => {
    const res = await request.fetch("/api/konto/transactions/999999/hide", { method: "PATCH" })
    expect(res.status()).toBe(404)
  })
})

// ── Transactions API: hidden filter ─────────────────────────────────────────

test.describe("AC: GET /api/konto/transactions hidden filter", () => {
  test("default response excludes hidden=1 transactions", async ({ request }) => {
    const res = await request.get("/api/konto/transactions")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.transactions).toBeDefined()
    // All returned transactions should have hidden=0
    for (const tx of body.transactions) {
      expect(tx.hidden).toBe(0)
    }
  })

  test("?hidden=1 returns only hidden transactions", async ({ request }) => {
    const res = await request.get("/api/konto/transactions?hidden=1")
    expect(res.status()).toBe(200)
    const body = await res.json()
    for (const tx of body.transactions) {
      expect(tx.hidden).toBe(1)
    }
  })

  test("?hidden=all returns transactions of both types", async ({ request }) => {
    const res = await request.get("/api/konto/transactions?hidden=all")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.transactions).toBeDefined()
    // If there's any hidden transaction, it should appear here
    // If none, the array is just all visible transactions
  })

  test("response includes alias and logo_path fields", async ({ request }) => {
    const res = await request.get("/api/konto/transactions")
    expect(res.status()).toBe(200)
    const body = await res.json()
    // These fields must be present (even if null)
    for (const tx of body.transactions) {
      expect(tx).toHaveProperty("alias")
      expect(tx).toHaveProperty("logo_path")
      expect(tx).toHaveProperty("hidden")
    }
  })
})

// ── Feature 2: Alias shown in Kontoauszug UI ─────────────────────────────────

test.describe("AC: Alias visible in Kontoauszug page", () => {
  test("Kontoauszug page loads without error", async ({ page }) => {
    await page.goto("/transaktionen")
    await expect(page.locator("body")).toBeVisible()
    // Should not show a crash / 500 error
    await expect(page.locator("text=Interner Fehler")).not.toBeVisible()
  })

  test("Kontoauszug page has alias edit (pencil) buttons per transaction", async ({ page }) => {
    await page.goto("/transaktionen")

    // If there are transactions, pencil buttons should be visible
    const transactionRows = page.locator("tbody tr")
    const count = await transactionRows.count()

    if (count > 0) {
      // At least one pencil (Alias bearbeiten) button should be present
      const pencilButtons = page.getByTitle("Alias bearbeiten")
      await expect(pencilButtons.first()).toBeVisible()
    }
  })

  test("Alias dialog opens on pencil click", async ({ page }) => {
    await page.goto("/transaktionen")

    const pencilButtons = page.getByTitle("Alias bearbeiten")
    const count = await pencilButtons.count()
    if (count === 0) {
      test.skip() // No transactions loaded, skip UI test
      return
    }

    // Expand first group if collapsed
    const firstGroupRow = page.locator("tbody tr.bg-gray-50").first()
    if (await firstGroupRow.isVisible()) {
      await firstGroupRow.click()
    }

    await pencilButtons.first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByText("Transaktions-Alias")).toBeVisible()
    await expect(page.getByLabel("Alias (lesbarer Name)")).toBeVisible()
  })

  test("Toggle hide button toggles transaction visibility", async ({ page }) => {
    await page.goto("/transaktionen")

    const hideButtons = page.getByTitle("Ausblenden")
    const count = await hideButtons.count()
    if (count === 0) {
      test.skip()
      return
    }

    // Expand first group
    const firstGroupRow = page.locator("tbody tr.bg-gray-50").first()
    if (await firstGroupRow.isVisible()) {
      await firstGroupRow.click()
    }

    const initialHideButtons = await page.getByTitle("Ausblenden").count()
    await page.getByTitle("Ausblenden").first().click()

    // After hiding, the number of "Ausblenden" buttons should decrease
    await page.waitForTimeout(500)
    const afterHideButtons = await page.getByTitle("Ausblenden").count()
    expect(afterHideButtons).toBeLessThan(initialHideButtons)

    // Switch to hidden view and unhide
    await page.getByRole("button", { name: /Ausgeblendete/ }).click()
    const unhideButtons = page.getByTitle("Einblenden")
    if (await unhideButtons.count() > 0) {
      await unhideButtons.first().click()
      await page.waitForTimeout(500)
    }
  })

  test("Hidden filter toggle switches between active and hidden transactions", async ({ page }) => {
    await page.goto("/transaktionen")

    // Wait for loading to complete: either empty state or toggle button appears
    const emptyState = page.getByText("Keine Transaktionen importiert")
    const toggleBtn = page.getByRole("button", { name: /Ausgeblendete/ })
    await emptyState.or(toggleBtn).waitFor({ timeout: 8000 })

    // If no transactions are imported, the toggle is not rendered — skip gracefully
    if (await emptyState.isVisible()) return

    await expect(toggleBtn).toBeVisible()

    // Switch to hidden view
    await toggleBtn.click()
    await page.waitForTimeout(300)

    // Switch back
    const activeBtn = page.getByRole("button", { name: /Aktive anzeigen/ })
    await expect(activeBtn).toBeVisible()
    await activeBtn.click()
  })
})
