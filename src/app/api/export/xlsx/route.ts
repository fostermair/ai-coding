import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import ExcelJS from "exceljs"

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") // YYYY-MM-DD
    const to = searchParams.get("to") // YYYY-MM-DD
    const useAliasParam = searchParams.get("useAlias")
    const useAlias = useAliasParam === "false" ? false : true

    // Validate date format if provided
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (from && !dateRe.test(from)) {
      return NextResponse.json({ message: "Ungültiges Datum (from)" }, { status: 400 })
    }
    if (to && !dateRe.test(to)) {
      return NextResponse.json({ message: "Ungültiges Datum (to)" }, { status: 400 })
    }

    // Build WHERE clause
    let where = ""
    const params: (string | number)[] = []

    if (from) {
      where += " WHERE r.receipt_date >= ?"
      params.push(from)
    }
    if (to) {
      where += (where ? " AND" : " WHERE") + " r.receipt_date <= ?"
      params.push(to)
    }

    // Format price (cents to EUR)
    const formatPrice = (cents: number): number => {
      return Math.round((cents / 100) * 100) / 100
    }

    // ── Sheet 1: Alle Positionen (same as CSV) ────────────────────────────────

    const items = db
      .prepare(
        `SELECT
          r.receipt_date,
          r.receipt_time,
          r.store_name,
          r.receipt_nr,
          ri.raw_name,
          ri.quantity,
          ri.unit_price_cents,
          ri.total_price_cents,
          ri.tax_code,
          pa.alias,
          (SELECT SUM(amount_cents) FROM item_discounts WHERE receipt_item_id = ri.id) AS discount_amount_cents
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        LEFT JOIN product_aliases pa ON ri.raw_name = pa.raw_name
        ${where}
        ORDER BY r.receipt_date DESC, r.receipt_time DESC, ri.position ASC`
      )
      .all(...params) as Array<{
        receipt_date: string
        receipt_time: string
        store_name: string
        receipt_nr: string
        raw_name: string
        quantity: number
        unit_price_cents: number
        total_price_cents: number
        tax_code: string
        alias: string | null
        discount_amount_cents: number | null
      }>

    // ── Sheet 2: Bon-Übersicht ──────────────────────────────────────────────

    const receipts = db
      .prepare(
        `SELECT
          r.receipt_date,
          r.receipt_time,
          r.store_name,
          r.receipt_nr,
          r.total_amount_cents,
          (SELECT COUNT(*) FROM receipt_items WHERE receipt_id = r.id) AS item_count
        FROM receipts r
        ${where}
        ORDER BY r.receipt_date DESC, r.receipt_time DESC`
      )
      .all(...params) as Array<{
        receipt_date: string
        receipt_time: string
        store_name: string
        receipt_nr: string
        total_amount_cents: number
        item_count: number
      }>

    // ── Sheet 3: Top-20 Produkte ───────────────────────────────────────────

    const topProducts = db
      .prepare(
        `SELECT
          ri.raw_name,
          pa.alias,
          COUNT(*) AS kaufhaeufigkeit,
          SUM(ri.total_price_cents) AS gesamt_cents
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        LEFT JOIN product_aliases pa ON ri.raw_name = pa.raw_name
        ${where}
        GROUP BY ri.raw_name
        ORDER BY kaufhaeufigkeit DESC
        LIMIT 20`
      )
      .all(...params) as Array<{
        raw_name: string
        alias: string | null
        kaufhaeufigkeit: number
        gesamt_cents: number
      }>

    // Create workbook
    const workbook = new ExcelJS.Workbook()

    // ── Add Sheet 1: Alle Positionen ───────────────────────────────────────
    const sheet1 = workbook.addWorksheet("Alle Positionen")
    sheet1.columns = [
      { header: "Datum", key: "datum", width: 12 },
      { header: "Uhrzeit", key: "uhrzeit", width: 10 },
      { header: "Markt", key: "markt", width: 25 },
      { header: "Bon-Nr.", key: "bon_nr", width: 15 },
      { header: "Produktname", key: "produktname", width: 30 },
      { header: "Menge", key: "menge", width: 8 },
      { header: "Einzelpreis", key: "einzelpreis", width: 12 },
      { header: "Gesamtpreis", key: "gesamtpreis", width: 12 },
      { header: "MwSt-Code", key: "mwst_code", width: 10 },
      { header: "Rabatt", key: "rabatt", width: 8 },
      { header: "Rabattbetrag", key: "rabatt_betrag", width: 13 },
    ]

    // Format header
    sheet1.getRow(1).font = { bold: true }

    // Add data
    for (const item of items) {
      const produktname = useAlias && item.alias ? item.alias : item.raw_name
      sheet1.addRow({
        datum: item.receipt_date,
        uhrzeit: item.receipt_time,
        markt: item.store_name,
        bon_nr: item.receipt_nr,
        produktname,
        menge: item.quantity,
        einzelpreis: formatPrice(item.unit_price_cents),
        gesamtpreis: formatPrice(item.total_price_cents),
        mwst_code: item.tax_code || "",
        rabatt: item.discount_amount_cents ? "Ja" : "Nein",
        rabatt_betrag: item.discount_amount_cents ? formatPrice(item.discount_amount_cents) : "",
      })
    }

    // Format number columns as numbers (not text)
    for (let i = 2; i <= sheet1.rowCount; i++) {
      sheet1.getCell(`F${i}`).numFmt = "0"
      sheet1.getCell(`G${i}`).numFmt = "0.00"
      sheet1.getCell(`H${i}`).numFmt = "0.00"
      sheet1.getCell(`K${i}`).numFmt = "0.00"
    }

    // ── Add Sheet 2: Bon-Übersicht ──────────────────────────────────────────
    const sheet2 = workbook.addWorksheet("Bon-Übersicht")
    sheet2.columns = [
      { header: "Datum", key: "datum", width: 12 },
      { header: "Uhrzeit", key: "uhrzeit", width: 10 },
      { header: "Markt", key: "markt", width: 25 },
      { header: "Bon-Nr.", key: "bon_nr", width: 15 },
      { header: "Anzahl Artikel", key: "item_count", width: 15 },
      { header: "Summe (EUR)", key: "total", width: 13 },
    ]

    sheet2.getRow(1).font = { bold: true }

    for (const receipt of receipts) {
      sheet2.addRow({
        datum: receipt.receipt_date,
        uhrzeit: receipt.receipt_time,
        markt: receipt.store_name,
        bon_nr: receipt.receipt_nr,
        item_count: receipt.item_count,
        total: formatPrice(receipt.total_amount_cents),
      })
    }

    // Format number columns
    for (let i = 2; i <= sheet2.rowCount; i++) {
      sheet2.getCell(`E${i}`).numFmt = "0"
      sheet2.getCell(`F${i}`).numFmt = "0.00"
    }

    // ── Add Sheet 3: Top-20 Produkte ────────────────────────────────────────
    const sheet3 = workbook.addWorksheet("Top-20 Produkte")
    sheet3.columns = [
      { header: "Rang", key: "rang", width: 6 },
      { header: "Produktname", key: "produktname", width: 30 },
      { header: "Kaufhäufigkeit", key: "kaufhaeufigkeit", width: 15 },
      { header: "Gesamtausgaben (EUR)", key: "gesamt", width: 18 },
    ]

    sheet3.getRow(1).font = { bold: true }

    let rank = 1
    for (const product of topProducts) {
      const produktname = useAlias && product.alias ? product.alias : product.raw_name
      sheet3.addRow({
        rang: rank++,
        produktname,
        kaufhaeufigkeit: product.kaufhaeufigkeit,
        gesamt: formatPrice(product.gesamt_cents),
      })
    }

    // Format number columns
    for (let i = 2; i <= sheet3.rowCount; i++) {
      sheet3.getCell(`B${i}`).numFmt = "0"
      sheet3.getCell(`C${i}`).numFmt = "0"
      sheet3.getCell(`D${i}`).numFmt = "0.00"
    }

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer()

    const today = new Date().toISOString().split("T")[0]
    const filename = `ebon-export-${today}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (e) {
    console.error("[/api/export/xlsx] Error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Excel-Export" }, { status: 500 })
  }
}
