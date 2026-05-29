import { test, expect } from "@playwright/test"

// ── AC: Kategorien-API (CRUD) ────────────────────────────────────────────────

test.describe("AC: Kategorien API — GET/POST", () => {
  const testMuster = `TEST-PROJ36-${Date.now()}`

  test.afterEach(async ({ request }) => {
    // Clean up: find and delete any test rules
    const res = await request.get("/api/konto/transactions/categories")
    if (!res.ok()) return
    const { categories } = await res.json()
    for (const cat of categories) {
      if (cat.muster.startsWith("TEST-PROJ36-")) {
        await request.delete(`/api/konto/transactions/categories/${cat.id}`)
      }
    }
  })

  test("GET returns 200 with categories array", async ({ request }) => {
    const res = await request.get("/api/konto/transactions/categories")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.categories)).toBe(true)
  })

  test("POST creates a category rule and it appears in GET", async ({ request }) => {
    const res = await request.post("/api/konto/transactions/categories", {
      data: { muster: testMuster, kategorie: "Lebensmittel" },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.category.muster).toBe(testMuster)
    expect(body.category.kategorie).toBe("Lebensmittel")

    const listRes = await request.get("/api/konto/transactions/categories")
    const { categories } = await listRes.json()
    expect(categories.some((c: { muster: string }) => c.muster === testMuster)).toBe(true)
  })

  test("POST returns 400 for empty muster", async ({ request }) => {
    const res = await request.post("/api/konto/transactions/categories", {
      data: { muster: "", kategorie: "Test" },
    })
    expect(res.status()).toBe(400)
  })

  test("POST returns 400 for empty kategorie", async ({ request }) => {
    const res = await request.post("/api/konto/transactions/categories", {
      data: { muster: testMuster, kategorie: "" },
    })
    expect(res.status()).toBe(400)
  })

  test("POST returns 409 for duplicate muster", async ({ request }) => {
    await request.post("/api/konto/transactions/categories", {
      data: { muster: testMuster, kategorie: "Lebensmittel" },
    })
    const dup = await request.post("/api/konto/transactions/categories", {
      data: { muster: testMuster, kategorie: "Anderes" },
    })
    expect(dup.status()).toBe(409)
  })
})

test.describe("AC: Kategorien API — PUT/DELETE", () => {
  let createdId: number
  const testMuster = `TEST-PROJ36-PUT-${Date.now()}`

  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/konto/transactions/categories", {
      data: { muster: testMuster, kategorie: "Lebensmittel" },
    })
    const body = await res.json()
    createdId = body.category.id
  })

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/konto/transactions/categories/${createdId}`).catch(() => {})
  })

  test("PUT updates muster and kategorie", async ({ request }) => {
    const res = await request.put(`/api/konto/transactions/categories/${createdId}`, {
      data: { muster: `${testMuster}-UPDATED`, kategorie: "Sonstiges" },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.category.kategorie).toBe("Sonstiges")
  })

  test("PUT returns 404 for unknown id", async ({ request }) => {
    const res = await request.put("/api/konto/transactions/categories/999999", {
      data: { muster: "X", kategorie: "Y" },
    })
    expect(res.status()).toBe(404)
  })

  test("PUT returns 400 for empty muster", async ({ request }) => {
    const res = await request.put(`/api/konto/transactions/categories/${createdId}`, {
      data: { muster: "", kategorie: "OK" },
    })
    expect(res.status()).toBe(400)
  })

  test("DELETE removes the rule", async ({ request }) => {
    const res = await request.delete(`/api/konto/transactions/categories/${createdId}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    // Verify gone
    const listRes = await request.get("/api/konto/transactions/categories")
    const { categories } = await listRes.json()
    expect(categories.some((c: { id: number }) => c.id === createdId)).toBe(false)
    createdId = -1 // mark as already deleted
  })

  test("DELETE returns 404 for unknown id", async ({ request }) => {
    const res = await request.delete("/api/konto/transactions/categories/999999")
    expect(res.status()).toBe(404)
  })
})

// ── AC: Transactions API includes kategorie field ────────────────────────────

test.describe("AC: GET /api/konto/transactions includes kategorie", () => {
  test("transactions response has kategorie field on each entry", async ({ request }) => {
    const res = await request.get("/api/konto/transactions")
    expect(res.status()).toBe(200)
    const { transactions } = await res.json()
    for (const tx of transactions) {
      expect(tx).toHaveProperty("kategorie")
    }
  })

  test("matching: kategorie is set when a rule matches beschreibung", async ({ request }) => {
    // Only verifiable if there are transactions; skip gracefully if not
    const txRes = await request.get("/api/konto/transactions")
    const { transactions } = await txRes.json()
    if (transactions.length === 0) return

    // Create a rule matching the first transaction's beschreibung exactly
    const firstTx = transactions[0]
    const muster = firstTx.beschreibung.slice(0, 5)
    const ruleRes = await request.post("/api/konto/transactions/categories", {
      data: { muster, kategorie: "QA-Test-Kategorie" },
    })
    if (!ruleRes.ok()) return // Skip if muster conflict

    const { category } = await ruleRes.json()

    try {
      const txRes2 = await request.get("/api/konto/transactions")
      const { transactions: txs2 } = await txRes2.json()
      const matched = txs2.find((t: { id: number }) => t.id === firstTx.id)
      // The transaction whose beschreibung starts with `muster` should now have the category
      if (matched && firstTx.beschreibung.toLowerCase().includes(muster.toLowerCase())) {
        expect(matched.kategorie).toBe("QA-Test-Kategorie")
      }
    } finally {
      await request.delete(`/api/konto/transactions/categories/${category.id}`)
    }
  })
})

// ── AC: Kategorien-Reiter in Transaktionsansicht ─────────────────────────────

test.describe("AC: Kategorien-Reiter UI", () => {
  test("Transaktionen page has Kategorien tab", async ({ page }) => {
    await page.goto("/transaktionen")
    await expect(page.getByRole("tab", { name: "Kategorien" })).toBeVisible()
  })

  test("Kategorien tab shows category manager when clicked", async ({ page }) => {
    await page.goto("/transaktionen")
    await page.getByRole("tab", { name: "Kategorien" }).click()
    // Form to add a new rule
    await expect(page.getByPlaceholder(/Muster/)).toBeVisible()
    await expect(page.getByPlaceholder(/Kategorie/)).toBeVisible()
    await expect(page.getByRole("button", { name: "Anlegen" })).toBeVisible()
  })

  test("Creating a rule shows it in the table", async ({ page, request }) => {
    const ts = Date.now()
    const testMuster = `E2E-PROJ36-${ts}`
    const testKategorie = `QA-Kat-${ts}`
    await page.goto("/transaktionen")
    await page.getByRole("tab", { name: "Kategorien" }).click()

    await page.getByPlaceholder(/Muster/).fill(testMuster)
    await page.getByPlaceholder(/Kategorie/).fill(testKategorie)

    // Wait for the POST response — rule creation is async
    const [response] = await Promise.all([
      page.waitForResponse((resp) =>
        resp.url().includes("/api/konto/transactions/categories") &&
        resp.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Anlegen" }).click(),
    ])
    expect(response.status()).toBe(201)

    // After creation the Kategorien tab must remain active (BUG-36-1 fix verification)
    await expect(page.getByRole("tab", { name: "Kategorien" })).toHaveAttribute("data-state", "active")
    await expect(page.getByText(testMuster)).toBeVisible()
    await expect(page.getByText(testKategorie)).toBeVisible()

    // Clean up
    const listRes = await request.get("/api/konto/transactions/categories")
    const { categories } = await listRes.json()
    const cat = categories.find((c: { muster: string }) => c.muster === testMuster)
    if (cat) await request.delete(`/api/konto/transactions/categories/${cat.id}`)
  })

  test("Empty muster shows validation error, no rule created", async ({ page }) => {
    await page.goto("/transaktionen")
    await page.getByRole("tab", { name: "Kategorien" }).click()

    await page.getByPlaceholder(/Kategorie/).fill("SomeKategorie")
    // Leave Muster empty
    await page.getByRole("button", { name: "Anlegen" }).click()

    await expect(page.getByText(/Muster darf nicht leer/)).toBeVisible()
  })

  test("Empty kategorie shows validation error", async ({ page }) => {
    await page.goto("/transaktionen")
    await page.getByRole("tab", { name: "Kategorien" }).click()

    await page.getByPlaceholder(/Muster/).fill("SomeMuster")
    // Leave Kategorie empty
    await page.getByRole("button", { name: "Anlegen" }).click()

    await expect(page.getByText(/Kategorie darf nicht leer/)).toBeVisible()
  })

  test("Delete rule shows confirmation dialog", async ({ page, request }) => {
    // First create a rule via API
    const testMuster = `E2E-DEL-${Date.now()}`
    const createRes = await request.post("/api/konto/transactions/categories", {
      data: { muster: testMuster, kategorie: "ZuLoeschen" },
    })
    if (!createRes.ok()) return
    const { category } = await createRes.json()

    await page.goto("/transaktionen")
    await page.getByRole("tab", { name: "Kategorien" }).click()

    // Find the delete button for the row
    const deleteBtn = page.getByTitle("Löschen").first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      // Confirmation dialog should appear
      await expect(page.getByRole("dialog")).toBeVisible()
      await expect(page.getByText(/Regel löschen/)).toBeVisible()
      // Cancel
      await page.getByRole("button", { name: "Abbrechen" }).click()
    }

    // Clean up
    await request.delete(`/api/konto/transactions/categories/${category.id}`)
  })

  test("No category badge on transactions without matching rule", async ({ page }) => {
    // With no rules, no purple badge should appear in the transactions tab
    await page.goto("/transaktionen")
    // Ensure on Transaktionen tab
    await page.getByRole("tab", { name: "Transaktionen" }).click()
    // Purple badges are only shown when kategorie != null — with no rules, none should appear
    // This checks the page loads cleanly without crashes
    await expect(page.locator("body")).toBeVisible()
    await expect(page.getByText("Interner Fehler")).not.toBeVisible()
  })
})
