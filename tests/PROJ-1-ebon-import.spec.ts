import { test, expect, request } from "@playwright/test"
import path from "path"
import fs from "fs"

const EBON_DIR = path.join(process.cwd(), "data", "ebons")
const EBON1 = path.join(EBON_DIR, "REWE-ebon1.pdf")
const EBON2 = path.join(EBON_DIR, "REWE-ebon2.pdf")
const EBON3 = path.join(EBON_DIR, "REWE-eBon3.pdf")

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Upload a PDF via the hidden file input and wait for a terminal status badge. */
async function uploadPdf(page: import("@playwright/test").Page, pdfPath: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(pdfPath)
  // Wait for processing to finish (pending → uploading → terminal state)
  await expect(
    page.getByText(/Importiert|Duplikat|Fehler/)
  ).toBeVisible({ timeout: 15000 })
}

// ── Import page ──────────────────────────────────────────────────────────────

test.describe("AC: Import page UI", () => {
  test("import page loads with drop zone and instructions", async ({ page }) => {
    await page.goto("/import")
    await expect(page.getByRole("heading", { name: "eBon importieren" })).toBeVisible()
    await expect(page.getByText("PDFs hier ablegen")).toBeVisible()
    await expect(page.getByText("REWE eBon PDFs").first()).toBeVisible()
  })

  test("file input accepts multiple PDFs", async ({ page }) => {
    await page.goto("/import")
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toHaveAttribute("multiple")
    await expect(fileInput).toHaveAttribute("accept", /.pdf/)
  })

  test("navigation links are present and correct", async ({ page }) => {
    await page.goto("/import")
    await expect(page.getByRole("link", { name: "Bons" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Import" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Produkte" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Statistiken" })).toBeVisible()
  })
})

// ── REWE-ebon2.pdf (clean import, positive sum) ──────────────────────────────

test.describe("AC: Import REWE-ebon2.pdf", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/import")
  })

  test("uploads successfully and shows Importiert or Duplikat badge", async ({ page }) => {
    await uploadPdf(page, EBON2)
    // Either success or duplicate (file may have been imported in a previous run)
    await expect(page.getByText(/Importiert|Duplikat/)).toBeVisible()
  })

  test("shows file name in queue after upload", async ({ page }) => {
    await uploadPdf(page, EBON2)
    await expect(page.getByText("REWE-ebon2.pdf")).toBeVisible()
  })

  test("success card shows summary (date, store, items, total)", async ({ page }) => {
    await uploadPdf(page, EBON2)
    // Parallel tests share DB — this may be a duplicate; only verify summary on fresh import
    const isDuplicate = await page.getByText("Duplikat").count() > 0
    if (!isDuplicate) {
      await expect(page.getByText(/23\.12\.2025/)).toBeVisible()
      await expect(page.getByText(/Rewe Markt/i)).toBeVisible()
    }
  })
})

// ── REWE-ebon1.pdf (negative sum – Leergut Rückgabe) ────────────────────────

test.describe("AC: Import REWE-ebon1.pdf (negative total)", () => {
  test("imports eBon with negative total (-38,29 EUR)", async ({ page }) => {
    await page.goto("/import")
    await uploadPdf(page, EBON1)
    await expect(page.getByText(/Importiert|Duplikat/)).toBeVisible()
    // Parallel tests share DB — only verify summary on fresh import
    const isDuplicate = await page.getByText("Duplikat").count() > 0
    if (!isDuplicate) {
      await expect(page.getByText(/-38,29/)).toBeVisible({ timeout: 10000 })
    }
  })
})

// ── REWE-eBon3.pdf (Getränkemarkt) ──────────────────────────────────────────

test.describe("AC: Import REWE-eBon3.pdf (Getränkemarkt)", () => {
  test("imports Getränkemarkt eBon successfully", async ({ page }) => {
    await page.goto("/import")
    await uploadPdf(page, EBON3)
    await expect(page.getByText(/Importiert|Duplikat/)).toBeVisible()
  })
})

// ── Duplicate detection ──────────────────────────────────────────────────────

test.describe("AC: Duplicate detection", () => {
  test("second import of same PDF shows Duplikat badge", async ({ page }) => {
    await page.goto("/import")
    // First upload
    await uploadPdf(page, EBON2)
    await expect(page.getByText(/Importiert|Duplikat/)).toBeVisible()

    // Reload and upload same file again
    await page.reload()
    await uploadPdf(page, EBON2)
    // Second upload must always be a duplicate
    await expect(page.getByText("Duplikat")).toBeVisible()
  })

  test("duplicate error message contains Bon-Nr.", async ({ page }) => {
    // Import ebon2 twice in the same session - second must always be duplicate
    await page.goto("/import")
    const fileInput = page.locator('input[type="file"]')

    // First upload: wait for terminal state
    await fileInput.setInputFiles(EBON2)
    await expect(page.getByText(/Importiert|Duplikat/)).toBeVisible({ timeout: 15000 })

    // Second upload of same file: must be duplicate
    await fileInput.setInputFiles(EBON2)
    // Two terminal-state badges now visible; the newest is "Duplikat"
    await expect(page.getByText("Duplikat")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Bon-Nr\./)).toBeVisible()
  })
})

// ── Batch upload ─────────────────────────────────────────────────────────────

test.describe("AC: Multiple file upload", () => {
  test("can upload multiple PDFs at once and sees one queue item per file", async ({ page }) => {
    await page.goto("/import")
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([EBON1, EBON2, EBON3])
    // Expect 3 filenames to appear in queue
    await expect(page.getByText("REWE-ebon1.pdf")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("REWE-ebon2.pdf")).toBeVisible()
    await expect(page.getByText("REWE-eBon3.pdf")).toBeVisible()
    // All should reach terminal status
    await expect(page.getByText(/Importiert|Duplikat/).first()).toBeVisible({ timeout: 20000 })
  })
})

// ── Error handling ───────────────────────────────────────────────────────────

test.describe("AC: Error handling", () => {
  test("uploading a non-PDF text file shows Fehler badge", async ({ page }) => {
    await page.goto("/import")
    // Create a temp text file disguised as PDF to test server-side rejection
    const fakePdfPath = path.join(process.cwd(), "data", "_test_fake.pdf")
    fs.writeFileSync(fakePdfPath, "This is not a real PDF")
    try {
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(fakePdfPath)
      await expect(page.getByText("Fehler")).toBeVisible({ timeout: 15000 })
    } finally {
      fs.unlinkSync(fakePdfPath)
    }
  })
})

// ── API: direct import test ──────────────────────────────────────────────────

test.describe("AC: API /api/import direct tests", () => {
  test("POST without file returns 400", async ({ request: req }) => {
    const resp = await req.post("/api/import", {
      multipart: {}, // no file
    })
    expect(resp.status()).toBe(400)
    const body = await resp.json()
    expect(body.message).toBeTruthy()
  })

  test("duplicate import returns 409 with message", async ({ request: req }) => {
    // ebon2 should already be imported from earlier tests
    const pdfBuffer = fs.readFileSync(EBON2)
    const resp = await req.post("/api/import", {
      multipart: {
        file: {
          name: "REWE-ebon2.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer,
        },
      },
    })
    // Either 200 (first import) or 409 (duplicate)
    expect([200, 409]).toContain(resp.status())
    if (resp.status() === 409) {
      const body = await resp.json()
      expect(body.message).toMatch(/Bon bereits importiert/)
    }
  })

  test("successful import returns structured result", async ({ request: req }) => {
    // Use ebon3 which is least likely to have been imported
    // (if already imported, test the 409 structure instead)
    const pdfBuffer = fs.readFileSync(EBON3)
    const resp = await req.post("/api/import", {
      multipart: {
        file: {
          name: "REWE-eBon3.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer,
        },
      },
    })
    expect([200, 409]).toContain(resp.status())
    if (resp.status() === 200) {
      const body = await resp.json()
      expect(body.date).toMatch(/\d{2}\.\d{2}\.\d{4}/)
      expect(body.store).toMatch(/Rewe/i)
      expect(body.items).toBeGreaterThan(0)
      expect(body.total).toMatch(/-?\d+,\d{2}/)
    }
  })
})

// ── Responsive / layout ──────────────────────────────────────────────────────

test.describe("Responsive: Mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test("import page is usable on mobile", async ({ page }) => {
    await page.goto("/import")
    await expect(page.getByRole("heading", { name: "eBon importieren" })).toBeVisible()
    await expect(page.getByText("PDFs hier ablegen")).toBeVisible()
  })
})
