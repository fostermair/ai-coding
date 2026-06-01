"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Upload, X, Receipt, Download, CreditCard, ChevronRight, Search, PackageCheck } from "lucide-react"
import Link from "next/link"
import { formatEuro, formatDate } from "@/lib/format"
import { ExportDialog } from "@/components/export-dialog"
import { AvisStatusBadge } from "@/components/avis-status-badge"
import { LifecycleStatusBadge } from "@/components/lifecycle-status-badge"
import { ChainBadge, PaymentBadge } from "@/components/chain-badge"
import { detectChain } from "@/lib/chain"
import { cn } from "@/lib/utils"

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
  bank_alias?: string | null
  bank_logo_path?: string | null
  market_alias?: string | null
  market_logo_path?: string | null
  has_bank_match?: number
  bank_match_source?: "auto" | "manual" | null
  has_bestellung?: number
}

interface HelloFreshTransaction {
  id: number
  bestellnummer: string
  datum: string
  produkt: string
  portionen: number | null
  personen: number | null
  grundpreis_cents: number
  liefergebuehren_cents: number
  rabatt_cents: number
  hf_cash_cents: number
  gesamt_cents: number
  status: "Bezahlt" | "Erstattet"
  importiert_am: string
}

interface BonsResponse {
  bons: BonSummary[]
  total_count: number
  total_spent_cents: number
}

type LedgerFilter = "alle" | "mit-beleg" | "ohne-beleg"

type LedgerEntry =
  | { type: "bon"; bon: BonSummary }
  | { type: "hf"; hf: HelloFreshTransaction }

function entryDate(e: LedgerEntry): string {
  return e.type === "bon" ? e.bon.receipt_date : e.hf.datum
}

function entryMatchesFilter(e: LedgerEntry, filter: LedgerFilter): boolean {
  if (filter === "alle") return true
  if (filter === "mit-beleg") return e.type === "bon" && !e.bon.is_virtual
  return (e.type === "bon" && !!e.bon.is_virtual) || e.type === "hf"
}

export function BonList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  const [data, setData] = useState<BonsResponse | null>(null)
  const [hfData, setHfData] = useState<HelloFreshTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("alle")
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const didInitYears = useRef(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (fromParam) params.set("from", fromParam)
      if (toParam) params.set("to", toParam)
      const query = params.toString()
      const [bonsRes, hfRes] = await Promise.all([
        fetch(`/api/bons${query ? `?${query}` : ""}`),
        fetch("/api/hellofresh/transactions"),
      ])
      if (!bonsRes.ok) throw new Error("Fehler beim Laden der Ausgaben")
      const bonsJson = await bonsRes.json()
      setData(bonsJson)
      if (hfRes.ok) {
        const hfJson = await hfRes.json()
        setHfData(hfJson.transactions ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [fromParam, toParam])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const groups = useMemo(() => {
    const allEntries: LedgerEntry[] = [
      ...(data?.bons ?? []).map((b) => ({ type: "bon" as const, bon: b })),
      ...hfData.map((hf) => ({ type: "hf" as const, hf })),
    ]
    const filtered = allEntries.filter((e) => entryMatchesFilter(e, ledgerFilter))
    const map = new Map<string, LedgerEntry[]>()
    for (const entry of filtered) {
      const date = entryDate(entry)
      if (!date) continue
      const year = date.substring(0, 4)
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(entry)
    }
    for (const items of map.values()) {
      items.sort((a, b) => entryDate(b).localeCompare(entryDate(a)))
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, items]) => ({ year, items }))
  }, [data, hfData, ledgerFilter])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = searchQuery.toLowerCase()
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((entry) => {
          if (entry.type === "bon") {
            const storeName = entry.bon.store_name?.toLowerCase() ?? ""
            return storeName.includes(q) || entry.bon.receipt_date.includes(q)
          }
          return entry.hf.produkt?.toLowerCase().includes(q) || entry.hf.datum.includes(q)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, searchQuery])

  useEffect(() => {
    if (!didInitYears.current && groups.length > 0) {
      const targetYear = fromParam ? fromParam.substring(0, 4) : groups[0].year
      const yearToExpand = groups.find((g) => g.year === targetYear)?.year ?? groups[0].year
      setExpandedYears(new Set([yearToExpand]))
      didInitYears.current = true
    }
  }, [groups, fromParam])

  const toggleYear = useCallback((year: string) => {
    setExpandedYears((prev) => {
      if (prev.has(year)) return new Set()
      return new Set([year])
    })
  }, [])

  const totalCount = useMemo(
    () => groups.reduce((s, g) => s + g.items.length, 0),
    [groups]
  )
  const totalSpent = useMemo(
    () =>
      groups.reduce(
        (s, g) =>
          s +
          g.items.reduce(
            (gs, e) => gs + (e.type === "bon" ? e.bon.total_amount_cents : e.hf.gesamt_cents),
            0
          ),
        0
      ),
    [groups]
  )

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
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchAll}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  // ── Empty state (no bons at all) ──────────────────────────────────────────
  if ((data?.total_count ?? 0) === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <Upload className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Noch keine Ausgaben importiert
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

  const filterLabel = fromParam
    ? (() => {
        const [y, m] = fromParam.split("-")
        const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
        return `${months[parseInt(m, 10) - 1]} ${y}`
      })()
    : null

  return (
    <div className="space-y-4">
      {/* Date filter banner */}
      {filterLabel && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm text-blue-700">
            Gefiltert: <span className="font-medium">{filterLabel}</span>
          </span>
          <button
            onClick={() => router.push("/")}
            className="text-blue-500 hover:text-blue-700 transition-colors"
            title="Filter entfernen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary Header */}
      <div className="flex items-center gap-6 rounded-lg border border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
            <p className="text-xs text-gray-500">Ausgabe{totalCount !== 1 ? "n" : ""}</p>
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

      {/* Filter + Search + Export bar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        {/* Segment Control */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shrink-0">
          {(["alle", "mit-beleg", "ohne-beleg"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLedgerFilter(f)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors border-r border-gray-200 last:border-r-0",
                ledgerFilter === f
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              {f === "alle" ? "Alle" : f === "mit-beleg" ? "Mit Beleg" : "Ohne Beleg"}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Markt oder Datum suchen …"
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {(data?.bons?.length ?? 0) > 0 && (
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

      {/* Search empty state */}
      {searchQuery.trim() && filteredGroups.length === 0 && (
        <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
          <p className="text-gray-500">Keine Ausgaben für „{searchQuery}" gefunden.</p>
          <Button variant="link" size="sm" onClick={() => setSearchQuery("")} className="mt-2">
            Suche löschen
          </Button>
        </div>
      )}

      {/* Filter empty state */}
      {!searchQuery.trim() && groups.length === 0 && (
        <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
          <p className="text-gray-500">
            {ledgerFilter === "mit-beleg"
              ? "Keine Ausgaben mit Beleg gefunden."
              : "Keine Ausgaben ohne Beleg gefunden."}
          </p>
        </div>
      )}

      {/* Ausgaben table */}
      {filteredGroups.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Datum</TableHead>
                <TableHead className="hidden sm:table-cell text-center">Uhrzeit</TableHead>
                <TableHead>Kette</TableHead>
                <TableHead>Markt</TableHead>
                <TableHead className="hidden md:table-cell">Bon-Nr.</TableHead>
                <TableHead className="text-right">Artikel</TableHead>
                <TableHead className="text-right">Summe</TableHead>
                <TableHead className="hidden sm:table-cell">Zahlung</TableHead>
                <TableHead className="text-center">Konto</TableHead>
                <TableHead className="text-center">AVIS</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => {
                const isExpanded = searchQuery.trim() ? true : expandedYears.has(group.year)
                const yearTotal = group.items.reduce(
                  (s, e) => s + (e.type === "bon" ? e.bon.total_amount_cents : e.hf.gesamt_cents),
                  0
                )
                return (
                  <React.Fragment key={`year-${group.year}`}>
                    <TableRow
                      className="bg-gray-50 hover:bg-gray-100 cursor-pointer select-none border-t border-gray-200"
                      onClick={() => toggleYear(group.year)}
                    >
                      <TableCell colSpan={11}>
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                          />
                          <span className="font-medium text-sm text-gray-800">{group.year}</span>
                          <span className="text-xs text-gray-400">
                            {group.items.length} Ausgabe{group.items.length !== 1 ? "n" : ""}
                          </span>
                          <span className="text-sm font-medium tabular-nums ml-auto text-gray-700">
                            {formatEuro(yearTotal)} €
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && group.items.map((entry) => {
                      if (entry.type === "hf") {
                        const hf = entry.hf
                        return (
                          <TableRow key={`hf-${hf.id}`} className="cursor-default">
                            <TableCell className="font-medium">{formatDate(hf.datum)}</TableCell>
                            <TableCell className="hidden sm:table-cell text-gray-400 text-center">–</TableCell>
                            <TableCell>
                              <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                                HelloFresh
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-gray-600">
                              {hf.produkt}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-gray-500">
                              {hf.bestellnummer}
                            </TableCell>
                            <TableCell className="text-right text-gray-400">–</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {formatEuro(hf.gesamt_cents)} €
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {hf.status !== "Bezahlt" && (
                                <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                  Storno
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-gray-400">–</TableCell>
                            <TableCell className="text-center text-gray-400">–</TableCell>
                            <TableCell className="text-center">
                              <LifecycleStatusBadge
                                is_virtual={0}
                                item_count={0}
                                source="hellofresh"
                              />
                            </TableCell>
                          </TableRow>
                        )
                      }

                      const bon = entry.bon
                      return (
                        <TableRow
                          key={bon.id}
                          className={bon.is_virtual ? "border-dashed opacity-80" : "cursor-pointer"}
                          onClick={bon.is_virtual ? undefined : () => router.push(`/bon/${bon.id}`)}
                        >
                          <TableCell className="font-medium">
                            {formatDate(bon.receipt_date)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-gray-500 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {bon.is_virtual ? (
                                <CreditCard className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              ) : null}
                              <span>{bon.receipt_time}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {bon.is_virtual ? (() => {
                              const logoPath = bon.bank_logo_path ?? bon.market_logo_path
                              if (logoPath)
                                return <img src={logoPath} alt="Logo" className="h-4 w-auto object-contain" />
                              const chain = detectChain(bon.bank_alias) ?? detectChain(bon.market_alias) ?? detectChain(bon.store_name)
                              return chain
                                ? <ChainBadge chain={chain} />
                                : <CreditCard className="h-4 w-4 text-gray-400" />
                            })() : (
                              <ChainBadge chain={bon.store_chain ?? detectChain(bon.store_name)} />
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {bon.bank_alias ?? bon.market_alias ?? bon.store_name}
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
                          <TableCell className="text-center text-gray-600 font-bold">
                            {bon.has_bank_match === 1 && bon.bank_match_source === "auto" && "€"}
                          </TableCell>
                          <TableCell className="text-center space-y-1">
                            {bon.store_chain === "rewe" && !bon.is_virtual && (
                              <div className="flex flex-col items-center gap-1">
                                <AvisStatusBadge status={bon.avis_status} />
                                {bon.has_bestellung === 1 && (
                                  <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                    <PackageCheck className="h-3 w-3" />
                                    Best.
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <LifecycleStatusBadge
                              is_virtual={bon.is_virtual}
                              item_count={bon.item_count}
                              avis_status={bon.avis_status}
                              has_bestellung={bon.has_bestellung}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </div>
  )
}
