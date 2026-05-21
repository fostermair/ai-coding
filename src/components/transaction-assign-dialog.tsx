"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatEuro, formatDate } from "@/lib/format"

interface BonCandidate {
  id: number
  receipt_date: string
  store_name: string
  total_amount_cents: number
  store_chain?: string
}

interface TransactionAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId: number
  buchungsdatum: string
  beschreibung: string
  betrag_cents: number
  onAssigned: () => void
}

export function TransactionAssignDialog({
  open,
  onOpenChange,
  transactionId,
  buchungsdatum,
  beschreibung,
  betrag_cents,
  onAssigned,
}: TransactionAssignDialogProps) {
  const [candidates, setCandidates] = useState<BonCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(null)
    setError(null)

    // Fetch bons within ±7 days of buchungsdatum
    const from = shiftDate(buchungsdatum, -7)
    const to = shiftDate(buchungsdatum, 7)

    fetch(`/api/bons?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => {
        setCandidates(
          (data.bons ?? []).filter((b: BonCandidate) => b.total_amount_cents === Math.abs(betrag_cents))
        )
      })
      .catch(() => setError("Bons konnten nicht geladen werden"))
      .finally(() => setLoading(false))
  }, [open, buchungsdatum, betrag_cents])

  const handleAssign = async () => {
    if (!selected) return
    setAssigning(true)
    try {
      const res = await fetch(`/api/konto/transactions/${transactionId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_id: selected }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message ?? "Zuweisung fehlgeschlagen")
      }
      onAssigned()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zuweisung fehlgeschlagen")
    } finally {
      setAssigning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bon zuordnen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-900">{beschreibung}</p>
            <p className="text-gray-500 mt-0.5">
              {formatDate(buchungsdatum)} · {formatEuro(Math.abs(betrag_cents))} €
            </p>
          </div>

          <p className="text-sm text-gray-600">
            Bons mit gleichem Betrag (±7 Tage):
          </p>

          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {!loading && candidates.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              Keine passenden Bons gefunden
            </p>
          )}

          {!loading && candidates.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {candidates.map((bon) => (
                <button
                  key={bon.id}
                  onClick={() => setSelected(bon.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    selected === bon.id
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{bon.store_name}</p>
                      <p className="text-xs text-gray-500">{formatDate(bon.receipt_date)}</p>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">
                      {formatEuro(bon.total_amount_cents)} €
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleAssign} disabled={!selected || assigning}>
            {assigning ? "Wird zugeordnet …" : "Zuordnen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
