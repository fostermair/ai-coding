import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

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

    // Build query with optional date filters
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

    // Fetch all receipt items with receipt info and alias
    const rows = db
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
          (SELECT COUNT(*) FROM item_discounts WHERE receipt_item_id = ri.id) > 0 AS has_discount,
          COALESCE((SELECT SUM(amount_cents) FROM item_discounts WHERE receipt_item_id = ri.id), 0) AS discount_amount_cents
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
        has_discount: boolean
        discount_amount_cents: number
      }>

    // Format prices as German locale (comma as decimal separator)
    const formatPrice = (cents: number): string => {
      return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    // Escape CSV value
    const escapeCSV = (value: string | null): string => {
      if (!value) return ""
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"` // Escape quotes by doubling
      }
      return value
    }

    // Build CSV content
    const headers = [
      "Datum",
      "Uhrzeit",
      "Markt",
      "Bon-Nr.",
      "Produktname",
      "Menge",
      "Einzelpreis",
      "Gesamtpreis",
      "MwSt-Code",
      "Rabatt",
      "Rabattbetrag",
    ]

    const lines: string[] = []
    lines.push(headers.join(",")) // Header

    for (const row of rows) {
      const produktname = useAlias && row.alias ? row.alias : row.raw_name
      const rabatt = row.has_discount ? "Ja" : "Nein"

      const csvLine = [
        row.receipt_date,
        row.receipt_time,
        escapeCSV(row.store_name),
        row.receipt_nr,
        escapeCSV(produktname),
        row.quantity,
        formatPrice(row.unit_price_cents),
        formatPrice(row.total_price_cents),
        row.tax_code || "",
        rabatt,
        row.has_discount ? formatPrice(row.discount_amount_cents) : "",
      ].join(",")

      lines.push(csvLine)
    }

    const csvContent = lines.join("\n")

    // UTF-8 BOM for Excel compatibility
    const bom = "﻿"
    const fileContent = bom + csvContent

    // Generate filename with today's date
    const today = new Date().toISOString().split("T")[0]
    const filename = `ebon-export-${today}.csv`

    return new NextResponse(fileContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (e) {
    console.error("[/api/export/csv] Error:", e)
    return NextResponse.json({ message: "Interner Fehler beim Export" }, { status: 500 })
  }
}
