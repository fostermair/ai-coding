"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Upload, X, Receipt, Download, CreditCard } from "lucide-react"
import Link from "next/link"
import { formatEuro, formatDate } from "@/lib/format"
import { ExportDialog } from "@/components/export-dialog"
import { AvisStatusBadge } from "@/components/avis-status-badge"

interface BonSummary {
  id: number
  receipt_date: string
  receipt_time: string
  store_name: string
  receipt_nr: string
  market_nr: string
  item_count: number
  total_amount_cents: number
  payment_method: string
  store_chain?: string
  avis_status?: "complete" | "pending" | "no_matches" | null
  is_virtual?: number
}

interface BonsResponse {
  bons: BonSummary[]
  total_count: number
  total_spent_cents: number
}

function ChainBadge({ chain }: { chain?: string }) {
  const src =
    chain === "lidl"
      ? "/badges/lidl.jpg"
      : chain === "kaufland"
        ? "/badges/kaufland.jpg"
        : "/badges/rewe.png"

  const label =
    chain === "lidl"
      ? "Lidl"
      : chain === "kaufland"
        ? "Kaufland"
        : "REWE"

  return <img src={src} alt={label} className="h-5 w-auto object-contain" />
}

function PaymentBadge({ method }: { method?: string }) {
  if (!method) return null
  const m = method.toLowerCase()
  if (m.includes("mastercard")) {
    return (
      <img
        src="/badges/mastercard.png"
        alt="Mastercard"
        className="h-5 w-auto object-contain"
      />
    )
  }
  if (m.includes("visa")) {
    return (
      <img
        src="/badges/visa.png"
        alt="Visa"
        className="h-5 w-auto object-contain"
      />
    )
  }
  if (m.includes("bar") || m.includes("bargeld")) {
    return (
      <img
        src="/badges/bar.png"
        alt="Barzahlung"
        className="h-5 w-auto object-contain"
      />
    )
  }
  if (m === "kartenzahlung") {
    return (
      <Badge variant="secondary" className="font-normal text-xs text-blue-700 bg-blue-50 border-blue-200">
        Kartenzahlung
      </Badge>
    )
  }
  if (m === "überweisung") {
    return (
      <Badge variant="secondary" className="font-normal text-xs text-purple-700 bg-purple-50 border-purple-200">
        Überweisung
      </Badge>
    )
  }
  if (m === "gutschrift") {
    return (
      <Badge variant="secondary" className="font-normal text-xs text-green-700 bg-green-50 border-green-200">
        Gutschrift
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="font-normal text-xs">
      {method}
    </Badge>
  )
}

export function BonList() {
  const router = useRouter()
  const [data, setData] = useState<BonsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const fetchBons = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set("from", dateFrom)
      if (dateTo) params.set("to", dateTo)
      const qs = params.toString()
      const res = await fetch(`/api/bons${qs ? `?${qs}` : ""}`)
      if (!res.ok) throw new Error("Fehler beim Laden der Bons")
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchBons()
  }, [fetchBons])

  const clearFilters = () => {
    setDateFrom("")
    setDateTo("")
  }

  const hasFilters = dateFrom || dateTo

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchBons}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  const bons = data?.bons ?? []
  const totalCount = data?.total_count ?? 0
  const totalSpent = data?.total_spent_cents ?? 0

  // ── Empty state (no bons at all) ──────────────────────────────────────────
  if (totalCount === 0 && !hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <Upload className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Noch keine Bons importiert
        </h2>
        <p className="text-sm text-gray-400 mb-6 max-w-sm">
          Importiere deine ersten eBon PDFs (REWE, Lidl, Kaufland) um die Auswertung zu starten.
        </p>
        <Button asChild>
          <Link href="/import">Ersten eBon importieren</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center gap-6 rounded-lg border border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
            <p className="text-xs text-gray-500">Bon{totalCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div>
          <p className="text-2xl font-semibold text-gray-900">
            {formatEuro(totalSpent)} EUR
          </p>
          <p className="text-xs text-gray-500">Gesamtausgaben</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="date-from" className="text-sm text-gray-500">
              Von
            </label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="date-to" className="text-sm text-gray-500">
              Bis
            </label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400 h-8">
              <X className="h-4 w-4 mr-1" /> Filter zurücksetzen
            </Button>
          )}
        </div>
        {bons.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExportDialogOpen(true)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportieren
          </Button>
        )}
      </div>

      {/* Filter empty state */}
      {bons.length === 0 && hasFilters && (
        <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
          <p className="text-gray-500">Keine Bons im gewählten Zeitraum gefunden.</p>
          <Button variant="link" size="sm" onClick={clearFilters} className="mt-2">
            Filter zurücksetzen
          </Button>
        </div>
      )}

      {/* Bon table */}
      {bons.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Datum</TableHead>
                <TableHead className="hidden sm:table-cell">Uhrzeit</TableHead>
                <TableHead>Markt</TableHead>
                <TableHead>Kette</TableHead>
                <TableHead className="hidden md:table-cell">Bon-Nr.</TableHead>
                <TableHead className="text-right">Artikel</TableHead>
                <TableHead className="text-right">Summe</TableHead>
                <TableHead className="hidden sm:table-cell">Zahlung</TableHead>
                <TableHead className="text-center">AVIS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bons.map((bon) => (
                <TableRow
                  key={bon.id}
                  className={bon.is_virtual ? "border-dashed opacity-80" : "cursor-pointer"}
                  onClick={bon.is_virtual ? undefined : () => router.push(`/bon/${bon.id}`)}
                >
                  <TableCell className="font-medium">
                    {formatDate(bon.receipt_date)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-500">
                    {bon.receipt_time}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    <div className="flex items-center gap-1.5">
                      {bon.is_virtual ? (
                        <CreditCard className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      ) : null}
                      <span>{bon.store_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {!bon.is_virtual && <ChainBadge chain={bon.store_chain} />}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-gray-500">
                    {bon.receipt_nr}
                  </TableCell>
                  <TableCell className="text-right">{bon.is_virtual ? "–" : bon.item_count}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatEuro(bon.total_amount_cents)} €
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <PaymentBadge method={bon.payment_method} />
                  </TableCell>
                  <TableCell className="text-center">
                    {bon.store_chain === "rewe" && !bon.is_virtual && <AvisStatusBadge status={bon.avis_status} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    </div>
  )
}
