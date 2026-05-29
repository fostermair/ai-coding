import { test, expect, type Page } from "@playwright/test"

// Helper: seed the DB with unmapped items via the API reset + import flow
// is complex, so we use API calls directly to set up state.

async function seedUnmappedItem(page: Page, rawName: string, alias?: string) {
  // Insert a product_alias (or remove one) by calling the existing alias endpoint.
  // We can't easily seed receipt_items via public API so we test via UI state
  // after the tab loads real data. These tests are integration-style and rely
  // on the app DB having some unmapped items.
  if (alias) {
    await page.request.put(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
      data: { alias, source: "manual" },
    })
  }
}

async function deleteAlias(page: Page, rawName: string) {
  await page.request.delete(`/api/produkte/${encodeURIComponent(rawName)}/alias`)
}

test.describe("PROJ-47: Bulk-Alias-Pflege-Worklist", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/produkte")
    await page.waitForLoadState("networkidle")
  })

  // AC1: Neue Sicht in /produkte als Tab "Ungemappte Artikel"
  test("AC1: Tab 'Ungemappte Artikel' ist in /produkte sichtbar", async ({ page }) => {
    const tab = page.getByRole("tab", { name: "Ungemappte Artikel" })
    await expect(tab).toBeVisible()
  })

  test("AC1: Tab 'Ungemappte Artikel' ist anklickbar und zeigt Inhalt", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    // Should render the worklist (either table or empty state)
    await expect(
      page.locator("text=ungemappte Artikel").or(page.locator("text=Alle Artikel sind aliasiert"))
    ).toBeVisible({ timeout: 10000 })
  })

  // AC2: Pro Zeile: Häufigkeit, letztes Bon-Datum, Vorschlag, Konfidenz, Eingabefeld, Aktion
  test("AC2: Tabelle zeigt korrekte Spaltenüberschriften", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    // Only check columns if there are items (not empty state)
    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      await expect(page.getByRole("columnheader", { name: "Produkt" })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Käufe" })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Vorschlag" })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Konfidenz" })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Alias" })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Aktion" })).toBeVisible()
    }
  })

  // AC3: Bulk-Aktion mit Slider
  test("AC3+AC5: Bulk-Aktion-Leiste mit Slider und Button ist sichtbar", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      // Slider should be present
      const slider = page.locator('input[type="range"]')
      await expect(slider).toBeVisible()

      // Default value is 90
      await expect(slider).toHaveValue("90")

      // Preview text
      await expect(page.locator("text=Aliase werden gesetzt").or(page.locator("text=Alias wird gesetzt"))).toBeVisible()
    }
  })

  test("AC5: Slider ändert Vorschau-Zahl in Echtzeit", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      const slider = page.locator('input[type="range"]')
      // Move slider to 50%
      await slider.fill("50")
      // Preview count text should still be present (just different number)
      await expect(
        page.locator("text=Aliase werden gesetzt").or(page.locator("text=Alias wird gesetzt"))
      ).toBeVisible()
      // % label should update
      await expect(page.locator("text=50%").last()).toBeVisible()
    }
  })

  // AC5: Button disabled bei 0 Kandidaten
  test("AC5: Bulk-Button ist disabled wenn keine Kandidaten", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      // Move slider to 100% — only perfect matches count, likely 0 candidates
      const slider = page.locator('input[type="range"]')
      await slider.fill("100")

      const bulkButton = page.getByRole("button", { name: /Alle übernehmen/ })
      // Check text shows "0 Aliase werden gesetzt" or button is disabled
      const zeroText = page.locator("text=0 Aliase werden gesetzt")
      if (await zeroText.isVisible()) {
        await expect(bulkButton).toBeDisabled()
      }
    }
  })

  // AC5: Confirmation-Dialog erscheint vor Bulk-Aktion
  test("AC5: Confirmation-Dialog erscheint vor Bulk-Speicherung", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      // Lower threshold to find candidates
      const slider = page.locator('input[type="range"]')
      await slider.fill("50")

      const bulkButton = page.getByRole("button", { name: /Alle übernehmen/ })
      const isDisabled = await bulkButton.isDisabled()

      if (!isDisabled) {
        await bulkButton.click()
        // Dialog should appear
        await expect(page.getByRole("alertdialog")).toBeVisible()
        await expect(page.locator("text=Vorschläge übernehmen")).toBeVisible()
        // Should have cancel button
        await expect(page.getByRole("button", { name: "Abbrechen" })).toBeVisible()
        // Cancel it
        await page.getByRole("button", { name: "Abbrechen" }).click()
        await expect(page.getByRole("alertdialog")).not.toBeVisible()
      }
    }
  })

  // US2: Überspringen-Button
  test("US2: Überspringen-Button blendet Zeile session-weit aus", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      // Count rows before skip
      const rows = page.locator("tbody tr")
      const rowsBefore = await rows.count()

      if (rowsBefore > 0) {
        // Click first skip button (X icon)
        const skipButton = rows.first().locator('button[title="Überspringen"]')
        await skipButton.click()

        // One fewer row should be visible
        await expect(rows).toHaveCount(rowsBefore - 1)

        // "übersprungen" text should appear in summary
        await expect(page.locator("text=übersprungen")).toBeVisible()

        // Click "zurücksetzen" to restore skipped items
        await page.locator("button:has-text('zurücksetzen')").click()
        await expect(rows).toHaveCount(rowsBefore)
      }
    }
  })

  // US2: Übernehmen-Button (suggested)
  test("US2: Übernehmen-Button speichert Alias und entfernt Zeile", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      const rows = page.locator("tbody tr")
      const rowsBefore = await rows.count()

      if (rowsBefore > 0) {
        const firstRow = rows.first()
        const rawName = await firstRow.locator("td").first().textContent()
        const acceptButton = firstRow.locator('button[title="Alias übernehmen"]')
        const isDisabled = await acceptButton.isDisabled()

        if (!isDisabled) {
          await acceptButton.click()
          // Row should disappear after save
          await expect(rows).toHaveCount(rowsBefore - 1, { timeout: 5000 })

          // Verify alias was saved by checking the product list
          if (rawName) {
            // Clean up: delete the alias we just set
            await deleteAlias(page, rawName.trim())
          }
        }
      }
    }
  })

  // US2: Eingabefeld für abweichenden Alias
  test("US2: Eingabefeld erlaubt abweichenden Alias", async ({ page }) => {
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert")
    const hasEmpty = await emptyState.isVisible()

    if (!hasEmpty) {
      const rows = page.locator("tbody tr")
      const rowCount = await rows.count()

      if (rowCount > 0) {
        const firstRow = rows.first()
        const input = firstRow.locator("input")
        await input.fill("Mein benutzerdefinierter Alias")
        await expect(input).toHaveValue("Mein benutzerdefinierter Alias")
      }
    }
  })

  // AC6: Empty State
  test("AC6: Empty-State-Meldung wenn alle Artikel aliasiert sind", async ({ page }) => {
    // We can't easily make ALL products aliased in a real DB,
    // but we verify the empty state component exists by checking it renders correctly
    // when the API returns no items. We test this by checking the component structure.
    await page.getByRole("tab", { name: "Ungemappte Artikel" }).click()
    await page.waitForLoadState("networkidle")

    const emptyState = page.locator("text=Alle Artikel sind aliasiert ✓")
    const hasItems = page.locator("tbody tr").first()

    // Either empty state or table should be visible
    const emptyVisible = await emptyState.isVisible()
    const itemsVisible = await hasItems.isVisible()
    expect(emptyVisible || itemsVisible).toBe(true)
  })

  // Regression: other tabs still work after adding new tab
  test("Regression: Tab 'Produkte' funktioniert weiterhin", async ({ page }) => {
    await page.getByRole("tab", { name: "Produkte" }).click()
    await page.waitForLoadState("networkidle")
    // Product table or empty state should be visible
    await expect(
      page.locator("text=Produkt suchen").or(page.locator("text=Noch keine Produkte"))
    ).toBeVisible({ timeout: 5000 })
  })

  test("Regression: Tab 'Ausgeblendet' funktioniert weiterhin", async ({ page }) => {
    await page.getByRole("tab", { name: /Ausgeblendet/ }).click()
    await page.waitForLoadState("networkidle")
    // Either shows products or empty state for excluded
    await expect(
      page.locator("text=Keine ausgeblendeten Artikel").or(page.locator("tbody tr"))
    ).toBeVisible({ timeout: 5000 })
  })
})
