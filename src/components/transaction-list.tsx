"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, ChevronRight, Pencil, Eye, EyeOff, Search, X, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ChainBadge } from "@/components/chain-badge"
import { detectChain } from "@/lib/chain"
import { formatEuro, formatDate } from "@/lib/format"
import { TransactionAliasDialog } from "@/components/transaction-alias-dialog"

interface Transaction {
  id: number
  buchungsdatum: string
  valutadatum: string
  typ: string
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  betrag_cents: number
  periode: string
  kontoauszug_datei: string | null
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
  hidden: number
  alias: string | null
  logo_path: string | null
}

function formatPeriode(periode: string): string {
  const [year, month] = periode.split("-")
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString("de-DE", { month: "short", year: "numeric" })
}

function stripPaperlessPrefix(datei: string | null): string | null {
  if (!datei) return null
  return datei.replace(/^\[paperless\]\s*/, "")
}

function MatchStatusBadge({ status }: { status: Transaction['match_status'] }) {
  const config: Record<string, { label: string; className: string }> = {
    matched:   { label: "Gematcht",   className: "bg-green-50 text-green-700 border-green-200" },
    virtual:   { label: "Virtuell",   className: "bg-orange-50 text-orange-700 border-orange-200" },
    pending:   { label: "Ausstehend", className: "bg-blue-50 text-blue-700 border-blue-200" },
    unmatched: { label: "Offen",      className: "bg-gray-100 text-gray-600 border-gray-200" },
    ignored:   { label: "Ignoriert",  className: "bg-gray-50 text-gray-400 border-gray-100" },
  }
  const { label, className } = config[status] ?? config.unmatched
  return (
    <Badge variant="outline" className={`text-xs font-normal ${className}`}>
      {label}
    </Badge>
  )
}

export function TransactionList() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const didInitGroups = useRef(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [pdfGroups, setPdfGroups] = useState<Set<string>>(new Set())
  const [pdfLoadingKey, setPdfLoadingKey] = useState<string | null>(null)
  const [pdfErrorKey, setPdfErrorKey] = useState<string | null>(null)

  const [aliasDialog, setAliasDialog] = useState<{
    open: boolean
    tx: Transaction | null
  }>({ open: false, tx: null })

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      const key = tx.kontoauszug_datei ?? tx.periode
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(tx)
    }
    return [...map.entries()]
      .sort((a, b) => b[1][0].periode.localeCompare(a[1][0].periode))
      .map(([key, txs]) => {
        const hasPaperlessPdf = txs.some((tx) => tx.kontoauszug_datei?.startsWith('[paperless]'))
        return { key, txs, periode: txs[0].periode, hasPaperlessPdf }
      })
  }, [transactions])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const q = searchQuery.toLowerCase()
    return groups
      .map((group) => ({
        ...group,
        txs: group.txs.filter((tx) =>
          [tx.alias, tx.haendler_name, tx.empfaenger_name, tx.beschreibung]
            .some((field) => field?.toLowerCase().includes(q))
        ),
      }))
      .filter((group) => group.txs.length > 0)
  }, [groups, searchQuery])

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      if (prev.has(key)) return new Set()
      return new Set([key])
    })
    setPdfGroups(new Set())
  }, [])

  const togglePdfMode = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPdfGroups((prev) => {
      if (prev.has(key)) return new Set()
      return new Set([key])
    })
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/konto/transactions?hidden=${showHidden ? "1" : "0"}`)
      if (!res.ok) throw new Error("Fehler beim Laden")
      const data = await res.json()
      setTransactions(data.transactions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [showHidden])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    if (!didInitGroups.current && groups.length > 0) {
      setExpandedGroups(new Set([groups[0].key]))
      didInitGroups.current = true
    }
  }, [groups])

  const handleRunMatching = async () => {
    setMatching(true)
    try {
      await fetch("/api/konto/match", { method: "POST" })
      await fetchTransactions()
    } finally {
      setMatching(false)
    }
  }


  const handleToggleHide = async (tx: Transaction) => {
    const nextHidden = tx.hidden ? 0 : 1
    const res = await fetch(`/api/konto/transactions/${tx.id}/hide`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: nextHidden === 1 }),
    })
    if (!res.ok) {
      await fetchTransactions()
      return
    }
    if (nextHidden === 1 && !showHidden) {
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
    } else if (nextHidden === 0 && showHidden) {
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
    } else {
      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, hidden: nextHidden } : t)),
      )
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchTransactions()}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  if (transactions.length === 0 && !showHidden) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <p className="text-gray-500 font-medium">Keine Transaktionen importiert</p>
        <p className="text-sm text-gray-400 mt-1">
          Importiere einen Kontoauszug auf der Import-Seite.
        </p>
      </div>
    )
  }

  const statusCounts = {
    matched: transactions.filter((t) => t.match_status === 'matched').length,
    pending: transactions.filter((t) => t.match_status === 'pending').length,
    virtual: transactions.filter((t) => t.match_status === 'virtual').length,
    unmatched: transactions.filter((t) => t.match_status === 'unmatched').length,
  }

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-sm">
          {!showHidden && statusCounts.matched > 0 && (
            <span className="text-green-600">{statusCounts.matched} gematcht</span>
          )}
          {!showHidden && statusCounts.virtual > 0 && (
            <span className="text-orange-600">{statusCounts.virtual} virtuell</span>
          )}
          {!showHidden && statusCounts.pending > 0 && (
            <span className="text-blue-600">{statusCounts.pending} ausstehend</span>
          )}
          {!showHidden && statusCounts.unmatched > 0 && (
            <span className="text-gray-500">{statusCounts.unmatched} offen</span>
          )}
          {showHidden && (
            <span className="text-gray-500">{transactions.length} ausgeblendet</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={showHidden ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowHidden((v) => !v)}
            className="gap-2"
          >
            {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showHidden ? "Aktive anzeigen" : "Ausgeblendete"}
          </Button>
          {!showHidden && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunMatching}
              disabled={matching}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${matching ? "animate-spin" : ""}`} />
              {matching ? "Matching läuft …" : "Matching neu starten"}
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Transaktionen suchen …"
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

      {/* Empty hidden state */}
      {transactions.length === 0 && showHidden && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-gray-500 font-medium">Keine ausgeblendeten Transaktionen</p>
        </div>
      )}

      {/* No search results */}
      {searchQuery.trim() && filteredGroups.length === 0 && transactions.length > 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-gray-500 font-medium">Keine Transaktionen für „{searchQuery}" gefunden</p>
        </div>
      )}

      {/* Table */}
      {transactions.length > 0 && filteredGroups.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Datum</TableHead>
                <TableHead />
                <TableHead>Beschreibung</TableHead>
                <TableHead className="hidden md:table-cell">Kontoauszug</TableHead>
                <TableHead className="hidden sm:table-cell">Typ</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                {!showHidden && <TableHead className="text-center">Status</TableHead>}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => {
                const isExpanded = searchQuery.trim() ? true : expandedGroups.has(group.key)
                const totalCents = group.txs.reduce((s, t) => s + t.betrag_cents, 0)
                const matched = group.txs.filter((t) => t.match_status === 'matched').length
                const pending = group.txs.filter((t) => t.match_status === 'pending').length
                const virtual_ = group.txs.filter((t) => t.match_status === 'virtual').length
                const unmatched = group.txs.filter((t) => t.match_status === 'unmatched').length
                const statusSummary = showHidden
                  ? `${group.txs.length} ausgeblendet`
                  : [
                      matched > 0 ? `${matched} gematcht` : null,
                      virtual_ > 0 ? `${virtual_} virtuell` : null,
                      pending > 0 ? `${pending} ausstehend` : null,
                      unmatched > 0 ? `${unmatched} offen` : null,
                    ]
                      .filter((s): s is string => s !== null)
                      .join(" · ")
                const hasPaperlessPdf = group.hasPaperlessPdf
                const showPdfMode = pdfGroups.has(group.key)

                return (
                  <React.Fragment key={`frag-${group.key}`}>
                    <TableRow
                      className="bg-gray-50 hover:bg-gray-100 cursor-pointer select-none border-t border-gray-200"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <TableCell colSpan={showHidden ? 7 : 8}>
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                          />
                          <span className="font-medium text-sm text-gray-800">
                            {formatPeriode(group.periode)}
                          </span>
                          <span className="text-xs text-gray-400 truncate max-w-[200px]">
                            {stripPaperlessPrefix(group.key) ?? group.key}
                          </span>
                          <span className="text-xs text-gray-500 ml-auto shrink-0">
                            {statusSummary}
                          </span>
                          <span className={`text-sm font-medium tabular-nums shrink-0 w-24 text-right ${totalCents < 0 ? "text-red-600" : "text-green-600"}`}>
                            {totalCents < 0 ? "-" : "+"}{formatEuro(Math.abs(totalCents))} €
                          </span>
                          {hasPaperlessPdf && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-7 w-7 p-0 ml-2 shrink-0 ${showPdfMode ? "text-blue-600" : "text-gray-400 hover:text-blue-600"}`}
                              title={showPdfMode ? "Zur Tabelle wechseln" : "PDF anzeigen"}
                              onClick={(e) => togglePdfMode(group.key, e)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && showPdfMode && (
                      <TableRow>
                        <TableCell colSpan={showHidden ? 7 : 8} className="p-0">
                          <div className="relative w-full bg-gray-50">
                            {pdfLoadingKey === group.key && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                                  <p className="text-sm text-gray-600">PDF wird geladen...</p>
                                </div>
                              </div>
                            )}
                            {pdfErrorKey === group.key && (
                              <div className="w-full h-[600px] flex items-center justify-center bg-red-50 border border-red-200">
                                <div className="text-center">
                                  <p className="text-sm font-medium text-red-700">PDF konnte nicht geladen werden</p>
                                  <p className="text-xs text-red-600 mt-1">Bitte versuchen Sie es später erneut</p>
                                </div>
                              </div>
                            )}
                            {pdfErrorKey !== group.key && (
                              <iframe
                                src={`/api/konto/statements/${group.periode}/pdf`}
                                className="w-full h-[600px] border-0"
                                title={`Kontoauszug ${formatPeriode(group.periode)}`}
                                onLoad={() => {
                                  setPdfLoadingKey(null)
                                  setPdfErrorKey(null)
                                }}
                                onError={() => {
                                  setPdfLoadingKey(null)
                                  setPdfErrorKey(group.key)
                                }}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {isExpanded && !showPdfMode && group.txs.map((tx) => {
                      const displayName = tx.alias || tx.haendler_name || tx.empfaenger_name || tx.beschreibung
                      return (
                        <TableRow key={tx.id} className={tx.hidden ? "opacity-60" : undefined}>
                          <TableCell className="font-medium tabular-nums">
                            {formatDate(tx.buchungsdatum)}
                          </TableCell>
                          <TableCell className="w-24">
                            {tx.logo_path ? (
                              <img src={tx.logo_path} alt="Logo" className="h-4 w-auto object-contain" />
                            ) : (
                              <ChainBadge chain={detectChain(tx.alias ?? tx.haendler_name ?? tx.empfaenger_name ?? tx.beschreibung)} className="h-4 w-auto object-contain" />
                            )}
                          </TableCell>
                          <TableCell className="max-w-[220px] text-sm">
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{displayName}</span>
                              {tx.alias && tx.beschreibung !== displayName && (
                                <span className="text-xs text-gray-400 truncate">{tx.beschreibung}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="leading-tight">
                              <p className="text-sm text-gray-700">{formatPeriode(tx.periode)}</p>
                              {tx.kontoauszug_datei && (
                                <p className="text-xs text-gray-400 truncate max-w-[160px]">
                                  {stripPaperlessPrefix(tx.kontoauszug_datei)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="secondary" className="text-xs font-normal capitalize">
                              {tx.typ}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${tx.betrag_cents < 0 ? "text-red-600" : "text-green-600"}`}>
                            {tx.betrag_cents < 0 ? "-" : "+"}{formatEuro(Math.abs(tx.betrag_cents))} €
                          </TableCell>
                          {!showHidden && (
                            <TableCell className="text-center">
                              <MatchStatusBadge status={tx.match_status} />
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                                title="Alias bearbeiten"
                                onClick={() => setAliasDialog({ open: true, tx })}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-7 w-7 p-0 ${tx.hidden ? "text-orange-500 hover:text-orange-600" : "text-gray-400 hover:text-gray-600"}`}
                                title={tx.hidden ? "Einblenden" : "Ausblenden"}
                                onClick={() => handleToggleHide(tx)}
                              >
                                {tx.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                              </Button>
                            </div>
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

      {aliasDialog.tx && (
        <TransactionAliasDialog
          key={aliasDialog.tx.beschreibung}
          open={aliasDialog.open}
          onOpenChange={(open) => setAliasDialog({ open, tx: open ? aliasDialog.tx : null })}
          beschreibung={aliasDialog.tx.beschreibung}
          currentAlias={aliasDialog.tx.alias}
          currentLogoPath={aliasDialog.tx.logo_path}
          onSaved={() => fetchTransactions()}
        />
      )}
    </div>
  )
}
