"use client"

import React, { useCallback, useEffect, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw, Loader2 } from "lucide-react"
import { PdfViewer } from "@/components/pdf-viewer"

type HistoryType = "ebon" | "avis" | "bestellung" | "kontoauszug"

interface EbonEntry {
  id: number
  filename: string
  imported_at: string
  store_name: string | null
  store_chain: string | null
  receipt_date: string | null
  total_amount_cents: number | null
  has_bank_match: boolean
}

interface AvisEntry {
  id: number
  filename: string
  imported_at: string
  status: string
  message: string | null
  avis_pickup_date: string | null
  matched_receipt_date: string | null
  matched_receipt_total_cents: number | null
  has_match: boolean
}

interface BestellungEntry {
  id: number
  filename: string
  imported_at: string
  order_number: string | null
  order_date: string | null
  order_total_cents: number | null
  matched_receipt_date: string | null
  matched_receipt_total_cents: number | null
  has_match: boolean
}

interface KontoauszugEntry {
  id: number
  filename: string | null
  imported_at: string
  konto_iban: string
  periode: string
  transaction_count: number | null
}

type HistoryEntry = EbonEntry | AvisEntry | BestellungEntry | KontoauszugEntry

type SortDir = "asc" | "desc"

const DEFAULT_SORT: Record<HistoryType, { key: string; dir: SortDir }> = {
  ebon: { key: "receipt_date", dir: "desc" },
  avis: { key: "avis_pickup_date", dir: "desc" },
  bestellung: { key: "order_date", dir: "desc" },
  kontoauszug: { key: "periode", dir: "desc" },
}

const EMPTY_MESSAGES: Record<HistoryType, string> = {
  ebon: "Noch keine eBons importiert",
  avis: "Noch keine AVIS importiert",
  bestellung: "Noch keine Bestellungen importiert",
  kontoauszug: "Noch keine Kontoauszüge importiert",
}

function formatDate(isoStr: string | null): string {
  if (!isoStr) return "–"
  try {
    return new Date(isoStr).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return isoStr
  }
}

function formatDatetime(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoStr
  }
}

function formatAmount(cents: number | null): string {
  if (cents === null || cents === undefined) return "–"
  return (cents / 100).toFixed(2).replace(".", ",") + " €"
}

function shortFilename(name: string | null): string {
  if (!name) return "–"
  const parts = name.split(/[\\/]/)
  return parts[parts.length - 1]
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const nullA = a === null || a === undefined || a === ""
  const nullB = b === null || b === undefined || b === ""
  if (nullA && nullB) return 0
  if (nullA) return 1
  if (nullB) return -1
  const cmp = String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
  return dir === "asc" ? cmp : -cmp
}

function sortRows<T>(rows: T[], key: string, dir: SortDir): T[] {
  return [...rows].sort((a, b) =>
    compareValues(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      dir
    )
  )
}

function ChainBadge({ chain }: { chain: string | null }) {
  const labels: Record<string, string> = {
    rewe: "REWE",
    lidl: "Lidl",
    kaufland: "Kaufland",
    edeka: "Edeka",
  }
  return (
    <span className="text-xs text-gray-500">{chain ? (labels[chain] ?? chain) : "–"}</span>
  )
}

function AvisStatusBadge({ row }: { row: AvisEntry }) {
  if (row.status === "error") {
    if (row.message?.includes("Kein Bon")) {
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 text-xs">
          Kein Bon
        </Badge>
      )
    }
    return (
      <Badge variant="destructive" className="text-xs">
        Import-Fehler
      </Badge>
    )
  }
  if (row.has_match) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs">
        Gematcht
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-gray-500 text-xs">
      Kein Treffer
    </Badge>
  )
}

function MatchBadge({ matched }: { matched: boolean }) {
  return matched ? (
    <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs">
      Gematcht
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-gray-500 text-xs">
      Kein Match
    </Badge>
  )
}

function SortableHead({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  col: string
  label: string
  sortKey: string
  sortDir: SortDir
  onSort: (col: string) => void
  className?: string
}) {
  const active = sortKey === col
  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3 text-gray-600" />
          ) : (
            <ChevronDown className="h-3 w-3 text-gray-600" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-gray-300" />
        )}
      </span>
    </TableHead>
  )
}

function ReimportButton({
  type,
  id,
  reimportingId,
  onReimport,
}: {
  type: HistoryType
  id: number
  reimportingId: number | null
  onReimport: (type: HistoryType, id: number) => void
}) {
  const isLoading = reimportingId === id
  const disabled = isLoading
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-gray-400 hover:text-gray-700"
      disabled={disabled}
      title={type === "kontoauszug" ? "Neu importieren (nur Paperless)" : "Neu importieren"}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onReimport(type, id)
      }}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}

function InlinePdf({ type, id }: { type: HistoryType; id: number }) {
  return (
    <div className="w-full" style={{ height: 600 }}>
      <PdfViewer
        src={`/api/import/pdf?type=${type}&id=${id}`}
        toolbar={false}
        className="w-full"
      />
    </div>
  )
}

export function ImportHistoryTable({ type }: { type: HistoryType }) {
  const [data, setData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState(DEFAULT_SORT[type].key)
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT[type].dir)
  const [reimportingId, setReimportingId] = useState<number | null>(null)
  const [reimportError, setReimportError] = useState<string | null>(null)

  const loadData = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    fetch(`/api/import/history?type=${type}`)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json)) setData(json)
        else if (!silent) setError("Fehler beim Laden der Daten")
      })
      .catch(() => { if (!silent) setError("Fehler beim Laden der Daten") })
      .finally(() => { if (!silent) setLoading(false) })
  }, [type])

  useEffect(() => {
    loadData()
  }, [loadData])

  function toggleSort(col: string) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(col)
      setSortDir("desc")
    }
  }

  function toggleRow(id: number) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  async function handleReimport(t: HistoryType, id: number) {
    setReimportingId(id)
    setReimportError(null)
    try {
      const res = await fetch("/api/import/reimport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: t, id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setReimportError(json.error ?? "Fehler beim Re-Import")
      } else {
        loadData(true)
      }
    } catch {
      setReimportError("Verbindungsfehler")
    } finally {
      setReimportingId(null)
    }
  }

  const sortProps = { sortKey, sortDir, onSort: toggleSort }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        Lade…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-red-500">
        {error}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        {EMPTY_MESSAGES[type]}
      </div>
    )
  }

  const errorBanner = reimportError && (
    <div className="mb-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
      {reimportError}
    </div>
  )

  if (type === "ebon") {
    const rows = sortRows(data as EbonEntry[], sortKey, sortDir)
    const colCount = 7
    return (
      <>
        {errorBanner}
        <div className="rounded-md border bg-white overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col="filename" label="Dateiname" {...sortProps} />
                <SortableHead col="imported_at" label="Importiert" {...sortProps} />
                <SortableHead col="store_chain" label="Markt" {...sortProps} />
                <SortableHead col="receipt_date" label="Bon-Datum" {...sortProps} />
                <SortableHead col="total_amount_cents" label="Betrag" {...sortProps} />
                <TableHead>Konto-Match</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggleRow(row.id)}>
                    <TableCell className="font-mono text-xs max-w-[240px] truncate" title={row.filename}>
                      {shortFilename(row.filename)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      {formatDatetime(row.imported_at)}
                    </TableCell>
                    <TableCell>
                      <ChainBadge chain={row.store_chain} />
                      {row.store_name && (
                        <span className="block text-xs text-gray-400 truncate max-w-[160px]" title={row.store_name}>
                          {row.store_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(row.receipt_date)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap tabular-nums">
                      {formatAmount(row.total_amount_cents)}
                    </TableCell>
                    <TableCell>
                      {row.has_bank_match ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 text-xs">✓</Badge>
                      ) : (
                        <span className="text-gray-400 text-sm">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right p-1">
                      <ReimportButton type={type} id={row.id} reimportingId={reimportingId} onReimport={handleReimport} />
                    </TableCell>
                  </TableRow>
                  {expandedId === row.id && (
                    <TableRow>
                      <TableCell colSpan={colCount} className="p-0 bg-gray-50">
                        <InlinePdf type={type} id={row.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    )
  }

  if (type === "avis") {
    const rows = sortRows(data as AvisEntry[], sortKey, sortDir)
    const colCount = 6
    return (
      <>
        {errorBanner}
        <div className="rounded-md border bg-white overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col="filename" label="Dateiname" {...sortProps} />
                <SortableHead col="imported_at" label="Importiert" {...sortProps} />
                <SortableHead col="avis_pickup_date" label="Abholtermin" {...sortProps} />
                <TableHead>Verknüpfter eBon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggleRow(row.id)}>
                    <TableCell className="font-mono text-xs max-w-[240px] truncate" title={row.filename}>
                      {shortFilename(row.filename)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      {formatDatetime(row.imported_at)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.avis_pickup_date ? formatDate(row.avis_pickup_date) : <span className="text-gray-400">–</span>}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.matched_receipt_date
                        ? `${formatDate(row.matched_receipt_date)} · ${formatAmount(row.matched_receipt_total_cents)}`
                        : <span className="text-gray-400">–</span>}
                    </TableCell>
                    <TableCell>
                      <AvisStatusBadge row={row} />
                    </TableCell>
                    <TableCell className="text-right p-1">
                      <ReimportButton type={type} id={row.id} reimportingId={reimportingId} onReimport={handleReimport} />
                    </TableCell>
                  </TableRow>
                  {expandedId === row.id && (
                    <TableRow>
                      <TableCell colSpan={colCount} className="p-0 bg-gray-50">
                        <InlinePdf type={type} id={row.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    )
  }

  if (type === "bestellung") {
    const rows = sortRows(data as BestellungEntry[], sortKey, sortDir)
    const colCount = 8
    return (
      <>
        {errorBanner}
        <div className="rounded-md border bg-white overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead col="filename" label="Dateiname" {...sortProps} />
                <SortableHead col="imported_at" label="Importiert" {...sortProps} />
                <SortableHead col="order_number" label="Bestellnummer" {...sortProps} />
                <SortableHead col="order_date" label="Bestelldatum" {...sortProps} />
                <SortableHead col="order_total_cents" label="Betrag" {...sortProps} />
                <TableHead>Verknüpfter eBon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggleRow(row.id)}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate" title={row.filename}>
                      {shortFilename(row.filename)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                      {formatDatetime(row.imported_at)}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {row.order_number ?? "–"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(row.order_date)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap tabular-nums">
                      {formatAmount(row.order_total_cents)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {row.matched_receipt_date
                        ? `${formatDate(row.matched_receipt_date)} · ${formatAmount(row.matched_receipt_total_cents)}`
                        : <span className="text-gray-400">–</span>}
                    </TableCell>
                    <TableCell>
                      <MatchBadge matched={row.has_match} />
                    </TableCell>
                    <TableCell className="text-right p-1">
                      <ReimportButton type={type} id={row.id} reimportingId={reimportingId} onReimport={handleReimport} />
                    </TableCell>
                  </TableRow>
                  {expandedId === row.id && (
                    <TableRow>
                      <TableCell colSpan={colCount} className="p-0 bg-gray-50">
                        <InlinePdf type={type} id={row.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    )
  }

  // kontoauszug
  const rows = sortRows(data as KontoauszugEntry[], sortKey, sortDir)
  const colCount = 6
  return (
    <>
      {errorBanner}
      <div className="rounded-md border bg-white overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead col="filename" label="Dateiname" {...sortProps} />
              <SortableHead col="imported_at" label="Importiert" {...sortProps} />
              <SortableHead col="periode" label="Zeitraum" {...sortProps} />
              <SortableHead col="konto_iban" label="IBAN" {...sortProps} />
              <SortableHead col="transaction_count" label="Transaktionen" {...sortProps} />
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => toggleRow(row.id)}>
                  <TableCell className="font-mono text-xs max-w-[240px] truncate" title={row.filename ?? ""}>
                    {shortFilename(row.filename)}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                    {formatDatetime(row.imported_at)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {row.periode}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.konto_iban}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {row.transaction_count ?? "–"}
                  </TableCell>
                  <TableCell className="text-right p-1">
                    <ReimportButton type={type} id={row.id} reimportingId={reimportingId} onReimport={handleReimport} />
                  </TableCell>
                </TableRow>
                {expandedId === row.id && (
                  <TableRow>
                    <TableCell colSpan={colCount} className="p-0 bg-gray-50">
                      <InlinePdf type={type} id={row.id} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
