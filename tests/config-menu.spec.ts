import { test, expect } from "@playwright/test"

test.describe("PROJ-22: Konfigurations-Menü (AVIS-DB & Alias löschen)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/")
    await page.waitForLoadState("networkidle")
  })

  test("AC-1: Settings-Button ist in der Navigation sichtbar", async ({ page }) => {
    // Look for settings button in navigation
    const settingsButton = page.getByTitle("Konfiguration")
    await expect(settingsButton).toBeVisible()

    // Button should have title attribute
    const title = await settingsButton.getAttribute("title")
    expect(title).toBe("Konfiguration")
  })

  test("AC-1: Klick auf Settings öffnet Dialog", async ({ page }) => {
    // Click settings button
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Dialog should appear
    await expect(page.getByRole("heading", { name: /Konfiguration & Datenverwaltung/i })).toBeVisible()
    await expect(page.getByText(/Administrative Funktionen/i)).toBeVisible()
  })

  test("AC-2: 'AVIS-Datenbank löschen' Button ist im Dialog", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Find AVIS delete button
    const avisButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await expect(avisButton).toBeVisible()
  })

  test("AC-2: Klick auf AVIS-Button zeigt Bestätigungsdialog mit Warnung", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click AVIS delete button
    const avisButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await avisButton.click()

    // Confirmation dialog should appear
    await expect(page.getByRole("heading", { name: /AVIS-Datenbank löschen/i })).toBeVisible()

    // Check for warning text
    await expect(page.getByText(/Dies löscht ALLE AVIS-Importe/i)).toBeVisible()
    await expect(page.getByText(/Diese Aktion kann nicht rückgängig gemacht werden/i)).toBeVisible()

    // Verify buttons exist
    await expect(page.getByRole("button", { name: /Abbrechen/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Ja, löschen/i })).toBeVisible()
  })

  test("AC-6: Abbrechen-Button schließt Bestätigungsdialog", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click AVIS delete button
    const avisButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await avisButton.click()

    // Click cancel
    const cancelButton = page.getByRole("button", { name: /Abbrechen/i }).first()
    await cancelButton.click()

    // Confirmation dialog should close
    await expect(page.getByRole("heading", { name: /AVIS-Datenbank löschen/i })).not.toBeVisible()

    // Main dialog should still be open
    await expect(page.getByRole("heading", { name: /Konfiguration & Datenverwaltung/i })).toBeVisible()
  })

  test("AC-3: 'Alle Alias löschen' Button ist im Dialog", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Find alias delete button
    const aliasButton = page.getByRole("button", { name: /Alle Alias löschen/i })
    await expect(aliasButton).toBeVisible()
  })

  test("AC-3: Klick auf Alias-Button zeigt Bestätigungsdialog mit Warnung", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click alias delete button
    const aliasButton = page.getByRole("button", { name: /Alle Alias löschen/i })
    await aliasButton.click()

    // Confirmation dialog should appear
    await expect(page.getByRole("heading", { name: /Alle Alias löschen/i })).toBeVisible()

    // Check for warning text
    await expect(page.getByText(/Dies setzt alle Produktalias auf ihre ursprünglichen Rohnames zurück/i)).toBeVisible()
    await expect(page.getByText(/Diese Aktion kann nicht rückgängig gemacht werden/i)).toBeVisible()
  })

  test("AC-5: Error handling - Dialog bleibt offen bei Fehler", async ({ page }) => {
    // Setup: Block the API call to simulate network error
    await page.route("**/api/avis/db", (route) => {
      route.abort("failed")
    })

    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click AVIS delete and confirm
    const avisButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await avisButton.click()

    const confirmButton = page.getByRole("button", { name: /Ja, löschen/i }).last()
    await confirmButton.click()

    // Wait for error message
    await page.waitForTimeout(500)

    // Error message should be visible (network error or API error)
    await expect(page.getByText(/Fehler beim Löschen|Netzwerkfehler/i)).toBeVisible()

    // Dialog should still be open
    await expect(page.getByRole("heading", { name: /Konfiguration & Datenverwaltung/i })).toBeVisible()

    // User can try again
    const retryButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await expect(retryButton).toBeVisible()
  })

  test("AC-4: Success message nach erfolgreichem Löschen (Happy Path)", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click AVIS delete and confirm
    const avisButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await avisButton.click()

    const confirmButton = page.getByRole("button", { name: /Ja, löschen/i }).last()
    await confirmButton.click()

    // Success message should appear (with count of deleted items)
    // Use .first() to select the dialog message (not the toast notification)
    await expect(page.getByText(/Imports entfernt|Keine AVIS-Daten/i).first()).toBeVisible()

    // Dialog should still be open (user can perform other actions)
    await expect(page.getByRole("heading", { name: /Konfiguration & Datenverwaltung/i })).toBeVisible()
  })

  test("AC-4: Success message verschwindet nach 3 Sekunden", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click alias delete and confirm
    const aliasButton = page.getByRole("button", { name: /Alle Alias löschen/i })
    await aliasButton.click()

    const confirmButton = page.getByRole("button", { name: /Ja, löschen/i }).last()
    await confirmButton.click()

    // Message should appear (success or "no data")
    // Use .first() to select the dialog message (not the toast notification)
    const successMessage = page.getByText(/Einträge zurückgesetzt|Keine Alias zum Löschen/i).first()
    await expect(successMessage).toBeVisible()

    // Wait 3+ seconds and check if message disappears
    await page.waitForTimeout(3500)
    await expect(successMessage).not.toBeVisible()
  })

  test("AC-1 + AC-2: Dialog closes when Schließen button is clicked", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Verify dialog is open
    await expect(page.getByRole("heading", { name: /Konfiguration & Datenverwaltung/i })).toBeVisible()

    // Click close button
    const closeButton = page.getByRole("button", { name: /Schließen/i })
    await closeButton.click()

    // Dialog should close
    await expect(page.getByRole("heading", { name: /Konfiguration & Datenverwaltung/i })).not.toBeVisible()
  })

  test("Edge Case: Empty database message for AVIS", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click AVIS delete and confirm
    const avisButton = page.getByRole("button", { name: /AVIS-Datenbank löschen/i })
    await avisButton.click()

    const confirmButton = page.getByRole("button", { name: /Ja, löschen/i }).last()
    await confirmButton.click()

    // Should show success message (either "deleted" or "no data")
    // Use .first() to select the dialog message (not the toast notification)
    await expect(page.getByText(/Imports entfernt|Keine AVIS-Daten|gelöscht/i).first()).toBeVisible()
  })

  test("Edge Case: Empty database message for Alias", async ({ page }) => {
    // Open settings
    const settingsButton = page.getByTitle("Konfiguration")
    await settingsButton.click()

    // Click alias delete and confirm
    const aliasButton = page.getByRole("button", { name: /Alle Alias löschen/i })
    await aliasButton.click()

    const confirmButton = page.getByRole("button", { name: /Ja, löschen/i }).last()
    await confirmButton.click()

    // Should show success message (either "deleted" or "no data")
    // Use .first() to select the dialog message (not the toast notification)
    await expect(page.getByText(/Einträge zurückgesetzt|Keine Alias|gelöscht/i).first()).toBeVisible()
  })
})
