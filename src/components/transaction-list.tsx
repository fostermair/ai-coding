"use client"

import { useState, useEffect, useCallback } from "react"
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
import { RefreshCw, Link2, Link2Off } from "lucide-react"
import { formatEuro, formatDate } from "@/lib/format"
import { TransactionAssignDialog } from "@/components/transaction-assign-dialog"

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
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
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
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean
    tx: Transaction | null
  }>({ open: false, tx: null })

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/konto/transactions")
      if (!res.ok) throw new Error("Fehler beim Laden")
      const data = await res.json()
      setTransactions(data.transactions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const handleRunMatching = async () => {
    setMatching(true)
    try {
      await fetch("/api/konto/match", { method: "POST" })
      await fetchTransactions()
    } finally {
      setMatching(false)
    }
  }

  const handleUnassign = async (tx: Transaction) => {
    try {
      await fetch(`/api/konto/transactions/${tx.id}/assign`, { method: "DELETE" })
      await fetchTransactions()
    } catch {
      // ignore
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
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchTransactions}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  if (transactions.length === 0) {
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
          {statusCounts.matched > 0 && (
            <span className="text-green-600">{statusCounts.matched} gematcht</span>
          )}
          {statusCounts.virtual > 0 && (
            <span className="text-orange-600">{statusCounts.virtual} virtuell</span>
          )}
          {statusCounts.pending > 0 && (
            <span className="text-blue-600">{statusCounts.pending} ausstehend</span>
          )}
          {statusCounts.unmatched > 0 && (
            <span className="text-gray-500">{statusCounts.unmatched} offen</span>
          )}
        </div>
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
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Datum</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead className="hidden sm:table-cell">Typ</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-medium tabular-nums">
                  {formatDate(tx.buchungsdatum)}
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-sm">
                  {tx.haendler_name || tx.empfaenger_name || tx.beschreibung}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="secondary" className="text-xs font-normal capitalize">
                    {tx.typ}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right tabular-nums font-medium ${tx.betrag_cents < 0 ? "text-red-600" : "text-green-600"}`}>
                  {tx.betrag_cents < 0 ? "-" : "+"}{formatEuro(Math.abs(tx.betrag_cents))} €
                </TableCell>
                <TableCell className="text-center">
                  <MatchStatusBadge status={tx.match_status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {(tx.match_status === 'unmatched' || tx.match_status === 'pending' || tx.match_status === 'virtual') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                        title="Bon manuell zuordnen"
                        onClick={() => setAssignDialog({ open: true, tx })}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    )}
                    {tx.match_status === 'matched' && tx.match_source === 'manual' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        title="Zuordnung aufheben"
                        onClick={() => handleUnassign(tx)}
                      >
                        <Link2Off className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Assign dialog */}
      {assignDialog.tx && (
        <TransactionAssignDialog
          open={assignDialog.open}
          onOpenChange={(open) => setAssignDialog({ open, tx: open ? assignDialog.tx : null })}
          transactionId={assignDialog.tx.id}
          buchungsdatum={assignDialog.tx.buchungsdatum}
          beschreibung={assignDialog.tx.haendler_name || assignDialog.tx.beschreibung}
          betrag_cents={assignDialog.tx.betrag_cents}
          onAssigned={fetchTransactions}
        />
      )}
    </div>
  )
}
