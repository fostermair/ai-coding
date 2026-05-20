"use client"

import { useState, useEffect } from "react"
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
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, Trash2, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { formatEuro, formatDate } from "@/lib/format"
import { AvisManualAssignDialog } from "@/components/avis-manual-assign-dialog"
import { Edit } from "lucide-react"

interface Discount {
  id: number
  description: string
  amount_cents: number
  tax_code: string
}

interface AvisMatch {
  matchId: number
  avisItemName: string
  avisUnitPriceCents: number
  confidence: number
  status: "pending" | "confirmed" | "rejected" | "auto_set" | "unmatched"
  match_source?: "avis_document" | "global_database" | null
}

interface ReceiptItem {
  id: number
  raw_name: string
  alias: string | null
  item_type: "product" | "pfand" | "leergut" | "concession"
  quantity: number
  unit_price_cents: number
  total_price_cents: number
  tax_code: string
  bonus_excluded: boolean
  concessionaire_code: string | null
  position: number
  discounts: Discount[]
  avis_match?: AvisMatch
}

interface BonDetail {
  id: number
  filename: string
  store_name: string
  store_address: string
  store_uid: string
  market_nr: string
  receipt_nr: string
  receipt_date: string
  receipt_time: string
  payment_method: string
  total_amount_cents: number
  needs_reparse: number
  paperless_doc_id: number | null
  has_avis: boolean
  items: ReceiptItem[]
}

export function BonDetailView({ bonId }: { bonId: string }) {
  const router = useRouter()
  const [bon, setBon] = useState<BonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [marking, setMarking] = useState(false)
  const [avisSyncing, setAvisSyncing] = useState(false)
  const [avisSyncMessage, setAvisSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/bons/${bonId}`)
        if (res.status === 404) {
          setError("Bon nicht gefunden")
          return
        }
        if (!res.ok) throw new Error("Fehler beim Laden")
        setBon(await res.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [bonId])

  const handleSync = async () => {
    setMarking(true)
    setError(null)
    try {
      const res = await fetch(`/api/bons/${bonId}/sync`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? "Sync fehlgeschlagen")
      // Reload bon with updated items
      const bonRes = await fetch(`/api/bons/${bonId}`)
      if (bonRes.ok) setBon(await bonRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync fehlgeschlagen")
    } finally {
      setMarking(false)
    }
  }

  const handleAvisSync = async () => {
    setAvisSyncing(true)
    setAvisSyncMessage(null)
    try {
      const res = await fetch("/api/paperless/avis-sync", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setAvisSyncMessage(data.message || "AVIS-Sync fehlgeschlagen")
      } else {
        const count = data.imported ?? 0
        setAvisSyncMessage(
          count > 0 ? `${count} AVIS importiert` : (data.message || "Keine neuen AVISe gefunden")
        )
        // Bon neu laden, damit neue Aliases in der Tabelle erscheinen
        const bonRes = await fetch(`/api/bons/${bonId}`)
        if (bonRes.ok) setBon(await bonRes.json())
      }
    } catch {
      setAvisSyncMessage("Netzwerkfehler")
    } finally {
      setAvisSyncing(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/bons/${bonId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Löschen fehlgeschlagen")
      router.push("/")
    } catch {
      setDeleting(false)
      setError("Löschen fehlgeschlagen")
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !bon) {
    return (
      <div className="space-y-4">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-600 font-medium">{error ?? "Bon nicht gefunden"}</p>
        </div>
      </div>
    )
  }

  const products = bon.items.filter(
    (i) => i.item_type === "product" || i.item_type === "concession"
  )
  const pfandLeergut = bon.items.filter(
    (i) => i.item_type === "pfand" || i.item_type === "leergut"
  )

  // Compute VAT totals from items
  const vatA = bon.items
    .filter((i) => i.tax_code === "A")
    .reduce((sum, i) => sum + i.total_price_cents, 0)
  const vatB = bon.items
    .filter((i) => i.tax_code === "B")
    .reduce((sum, i) => sum + i.total_price_cents, 0)

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>

      {/* Header card */}
      <Card className="shadow-none border-gray-100">
        <CardContent className="py-5 px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {bon.store_name}
              </h2>
              {bon.store_address && (
                <p className="text-sm text-gray-500 mt-0.5">{bon.store_address}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-gray-600">
                <span>{formatDate(bon.receipt_date)}, {bon.receipt_time} Uhr</span>
                <span>Bon-Nr. {bon.receipt_nr}</span>
                <span>Markt {bon.market_nr}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-gray-900">
                {formatEuro(bon.total_amount_cents)} €
              </p>
              <Badge variant="secondary" className="mt-1 font-normal text-xs">
                {bon.payment_method}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products table */}
      {products.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-full">Produkt</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Menge</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Einzelpreis</TableHead>
                <TableHead className="text-right">Gesamt</TableHead>
                <TableHead className="text-center w-12">MwSt</TableHead>
                <TableHead className="text-center w-8">AVIS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((item) => (
                <ItemRows
                  key={item.id}
                  item={item}
                  receiptId={bon.id}
                  hasAvis={bon.has_avis}
                  onItemUpdate={() => {
                    // Reload bon to refresh item states
                    fetch(`/api/bons/${bonId}`).then((res) => {
                      if (res.ok) res.json().then((data) => setBon(data))
                    })
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pfand / Leergut section */}
      {pfandLeergut.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 mb-2">Pfand & Leergut</h3>
          <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
            <Table>
              <TableBody>
                {pfandLeergut.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {(item.alias || null) ?? (/^\d+$/.test(item.raw_name) ? "(unbekannt)" : item.raw_name)}
                      {!!item.bonus_excluded && (
                        <span className="text-gray-400 ml-1">*</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      {item.quantity > 1 ? `${item.quantity} Stk` : ""}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell tabular-nums text-gray-500">
                      {item.quantity > 1 ? `${formatEuro(item.unit_price_cents)} €` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      <span className={item.total_price_cents < 0 ? "text-green-600" : ""}>
                        {formatEuro(item.total_price_cents)} €
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs font-normal">
                        {item.tax_code}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* VAT breakdown */}
      <div className="rounded-lg border border-gray-100 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-500 mb-2">MwSt-Aufschlüsselung</h3>
        <div className="space-y-1 text-sm">
          {vatA !== 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">A = 19%</span>
              <span className="tabular-nums">{formatEuro(vatA)} €</span>
            </div>
          )}
          {vatB !== 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">B = 7%</span>
              <span className="tabular-nums">{formatEuro(vatB)} €</span>
            </div>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between font-medium">
            <span>Summe</span>
            <span className="tabular-nums">{formatEuro(bon.total_amount_cents)} €</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div />
          <div className="flex gap-2">
            {bon.paperless_doc_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={marking}
                className="text-gray-600"
              >
                {marking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                {marking ? "Wird synchronisiert …" : "Aus Paperless neu einlesen"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAvisSync}
              disabled={avisSyncing}
              className="text-gray-600"
            >
              {avisSyncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              {avisSyncing ? "AVIS wird abgeholt …" : "AVIS neu einlesen"}
            </Button>
            <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1.5" />
              Bon löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bon löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Bon-Nr. {bon.receipt_nr} vom {formatDate(bon.receipt_date)} ({bon.store_name}) wird unwiderruflich gelöscht,
                einschließlich aller Positionen und Rabatte.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Lösche …" : "Endgültig löschen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {avisSyncMessage && (
          <p className="text-xs text-gray-500 text-right">{avisSyncMessage}</p>
        )}
      </div>
    </div>
  )
}

interface ItemRowsProps {
  item: ReceiptItem
  receiptId: number
  hasAvis: boolean
  onItemUpdate: () => void
}

function ItemRows({ item, receiptId, hasAvis, onItemUpdate }: ItemRowsProps) {
  const [confirming, setConfirming] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [itemState, setItemState] = useState<ReceiptItem>(item)

  const handleConfirm = async () => {
    if (!itemState.avis_match) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/avis/matches/${itemState.avis_match.matchId}/confirm`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_alias: itemState.avis_match.avisItemName }),
      })
      if (!res.ok) throw new Error("Bestätigung fehlgeschlagen")
      const data = await res.json()
      setItemState((prev) => ({
        ...prev,
        avis_match: prev.avis_match
          ? { ...prev.avis_match, status: "confirmed" }
          : undefined,
        alias: data.alias,
      }))
    } catch (e) {
      console.error("Confirm failed:", e)
    } finally {
      setConfirming(false)
    }
  }

  const handleReject = async () => {
    if (!itemState.avis_match) return
    setRejecting(true)
    try {
      const res = await fetch(`/api/avis/matches/${itemState.avis_match.matchId}/reject`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error("Ablehnung fehlgeschlagen")
      setItemState((prev) => ({
        ...prev,
        avis_match: prev.avis_match
          ? { ...prev.avis_match, status: "rejected" }
          : undefined,
      }))
    } catch (e) {
      console.error("Reject failed:", e)
    } finally {
      setRejecting(false)
    }
  }

  const handleManualAssign = async (
    avisItemName: string,
    matchSource: "avis_document" | "global_database"
  ) => {
    try {
      const res = await fetch("/api/avis/matches/manual-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_item_id: itemState.id,
          receipt_id: receiptId,
          avis_item_name: avisItemName,
          match_source: matchSource,
          existing_match_id: itemState.avis_match?.matchId,
        }),
      })
      if (!res.ok) throw new Error("Zuweisung fehlgeschlagen")

      // Update local state
      setItemState((prev) => ({
        ...prev,
        alias: avisItemName,
        avis_match: prev.avis_match
          ? {
              ...prev.avis_match,
              avisItemName,
              status: "confirmed",
              match_source: matchSource,
            }
          : {
              matchId: 0, // Will be replaced after refetch
              avisItemName,
              avisUnitPriceCents: 0,
              confidence: 0,
              status: "confirmed",
              match_source: matchSource,
            },
      }))

      // Trigger parent reload
      onItemUpdate()
      setEditDialogOpen(false)
    } catch (e) {
      console.error("Manual assign failed:", e)
      throw e
    }
  }

  const avisMatch = itemState.avis_match
  const showEditButton = avisMatch?.status === "rejected" || !avisMatch

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {/* AVIS match status indicator */}
            {avisMatch && (
              <>
                {avisMatch.status === "confirmed" || avisMatch.status === "auto_set" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : avisMatch.status === "rejected" ? (
                  <XCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : null}
              </>
            )}
            <span>
              {(itemState.alias || null) ?? (/^\d+$/.test(itemState.raw_name) ? "(unbekannt)" : itemState.raw_name)}
              {avisMatch && avisMatch.status === "rejected" && (
                <span className="text-gray-400 text-xs ml-1">(kein Match)</span>
              )}
            </span>
            {showEditButton && (
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-gray-500 hover:text-gray-700"
                onClick={() => setEditDialogOpen(true)}
                title="AVIS-Name manuell zuweisen"
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
          {itemState.concessionaire_code && (
            <Badge variant="outline" className="ml-2 text-xs font-normal">
              {itemState.concessionaire_code}
            </Badge>
          )}
          {!!itemState.bonus_excluded && (
            <span className="text-gray-400 ml-1">*</span>
          )}
        </TableCell>
        <TableCell className="text-right hidden sm:table-cell">
          {itemState.quantity > 1 ? `${itemState.quantity} Stk` : ""}
        </TableCell>
        <TableCell className="text-right hidden sm:table-cell tabular-nums text-gray-500">
          {itemState.quantity > 1 ? `${formatEuro(itemState.unit_price_cents)} €` : ""}
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">
          {formatEuro(itemState.total_price_cents)} €
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="outline" className="text-xs font-normal">
            {itemState.tax_code}
          </Badge>
        </TableCell>
        <TableCell className="text-center text-xs">
          {avisMatch?.status === "confirmed" || avisMatch?.status === "auto_set" ? (
            <div className="flex items-center justify-center gap-1">
              <span className="text-green-600 font-medium">✓</span>
              {avisMatch.status === "confirmed" && avisMatch.match_source === "avis_document" && (
                <Badge variant="outline" className="text-xs font-normal bg-green-50 border-green-200 text-green-700">
                  AVIS
                </Badge>
              )}
              {avisMatch.status === "confirmed" && avisMatch.match_source === "global_database" && (
                <Badge variant="outline" className="text-xs font-normal bg-blue-50 border-blue-200 text-blue-700">
                  Global
                </Badge>
              )}
            </div>
          ) : avisMatch?.status === "rejected" ? (
            <span className="text-gray-400">⊗</span>
          ) : null}
        </TableCell>
      </TableRow>

      {/* AVIS match pending review row */}
      {avisMatch && avisMatch.status === "pending" && (
        <TableRow className="bg-blue-50 hover:bg-blue-50">
          <TableCell colSpan={6} className="py-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  AVIS: <span className="text-blue-700">{avisMatch.avisItemName}</span>
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Konfidenz: {avisMatch.confidence}% • Preis: {formatEuro(avisMatch.avisUnitPriceCents)} €
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleConfirm}
                  disabled={confirming || rejecting}
                  className="gap-1 h-8"
                >
                  {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Bestätigen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReject}
                  disabled={confirming || rejecting}
                  className="gap-1 h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {rejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                  Ablehnen
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      {itemState.discounts.map((d) => (
        <TableRow key={d.id} className="hover:bg-transparent">
          <TableCell className="pl-8 text-sm text-red-500 py-1">
            ↳ {d.description}
          </TableCell>
          <TableCell className="hidden sm:table-cell" />
          <TableCell className="hidden sm:table-cell" />
          <TableCell className="text-right tabular-nums text-red-500 py-1 text-sm">
            {formatEuro(d.amount_cents)} €
          </TableCell>
          <TableCell className="text-center py-1">
            <Badge variant="outline" className="text-xs font-normal">
              {d.tax_code}
            </Badge>
          </TableCell>
          <TableCell />
        </TableRow>
      ))}

      {/* Manual assign dialog */}
      <AvisManualAssignDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        receiptId={receiptId}
        receiptItemId={itemState.id}
        rawName={itemState.raw_name}
        onAssign={handleManualAssign}
      />
    </>
  )
}
