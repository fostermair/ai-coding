"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

interface ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ConfirmType = "avis" | "alias" | "konto" | "bons" | null

export function ConfigDialog({ open, onOpenChange }: ConfigDialogProps) {
  const [confirmType, setConfirmType] = useState<ConfirmType>(null)
  const [avisLoading, setAvisLoading] = useState(false)
  const [aliasLoading, setAliasLoading] = useState(false)
  const [kontoLoading, setKontoLoading] = useState(false)
  const [bonsLoading, setBonsLoading] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const handleDeleteAvis = async () => {
    setAvisLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/avis/db", { method: "DELETE" })
      const data = await res.json()

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.message || "Fehler beim Löschen der AVIS-Datenbank aufgetreten",
        })
        return
      }

      setMessage({
        type: "success",
        text: data.message || `AVIS-Datenbank gelöscht. ${data.count} Imports entfernt.`,
      })
      toast.success(data.message || `AVIS-Datenbank gelöscht. ${data.count} Imports entfernt.`)

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage({
        type: "error",
        text: "Netzwerkfehler beim Löschen aufgetreten",
      })
    } finally {
      setAvisLoading(false)
      setConfirmType(null)
    }
  }

  const handleDeleteBons = async () => {
    setBonsLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/bons/reset", { method: "DELETE" })
      const data = await res.json()

      if (!res.ok) {
        setMessage({ type: "error", text: data.message || "Fehler beim Löschen der Bons-Datenbank" })
        return
      }

      setMessage({ type: "success", text: data.message })
      toast.success(data.message)
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Löschen aufgetreten" })
    } finally {
      setBonsLoading(false)
      setConfirmType(null)
    }
  }

  const handleDeleteKonto = async () => {
    setKontoLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/konto/statements", { method: "DELETE" })
      const data = await res.json()

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.message || "Fehler beim Löschen der Kontoauszüge",
        })
        return
      }

      setMessage({ type: "success", text: data.message })
      toast.success(data.message)
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Löschen aufgetreten" })
    } finally {
      setKontoLoading(false)
      setConfirmType(null)
    }
  }

  const handleDeleteAlias = async () => {
    setAliasLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/produkte/aliases/bulk", { method: "DELETE" })
      const data = await res.json()

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.message || "Fehler beim Löschen der Alias aufgetreten",
        })
        return
      }

      setMessage({
        type: "success",
        text: data.message || `Alle Alias gelöscht. ${data.count} Einträge zurückgesetzt.`,
      })
      toast.success(data.message || `Alle Alias gelöscht. ${data.count} Einträge zurückgesetzt.`)

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage({
        type: "error",
        text: "Netzwerkfehler beim Löschen aufgetreten",
      })
    } finally {
      setAliasLoading(false)
      setConfirmType(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Konfiguration & Datenverwaltung</DialogTitle>
            <DialogDescription>
              Administrative Funktionen zum Verwalten und Zurücksetzen von Daten
            </DialogDescription>
          </DialogHeader>

          {/* Message Display */}
          {message && (
            <Alert className={message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <div className="flex gap-2">
                {message.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <AlertDescription
                  className={message.type === "success" ? "text-green-800" : "text-red-800"}
                >
                  {message.text}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Bons DB Reset */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Bons-Datenbank zurücksetzen</h3>
              <p className="text-xs text-gray-500 mt-1">
                Löscht alle Bons, Artikel, AVIS-Matches, Produktaliase und den Import-Log — kompletter Reset
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmType("bons")}
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading}
              className="w-full gap-2"
            >
              {bonsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {bonsLoading ? "Wird gelöscht..." : "Bons-Datenbank löschen"}
            </Button>
          </div>

          <Separator />

          {/* AVIS Database Management */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">AVIS-Datenbank Verwaltung</h3>
              <p className="text-xs text-gray-500 mt-1">
                Löscht alle AVIS-Importe, Matches und automatisch gesetzten Alias
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmType("avis")}
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading}
              className="w-full gap-2"
            >
              {avisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {avisLoading ? "Wird gelöscht..." : "AVIS-Datenbank löschen"}
            </Button>
          </div>

          <Separator />

          {/* Kontoauszug Management */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Kontoauszüge Verwaltung</h3>
              <p className="text-xs text-gray-500 mt-1">
                Löscht alle importierten Kontoauszüge, Transaktionen und deren Verknüpfungen zu Bons
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmType("konto")}
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading}
              className="w-full gap-2"
            >
              {kontoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {kontoLoading ? "Wird gelöscht..." : "Alle Kontoauszüge löschen"}
            </Button>
          </div>

          <Separator />

          {/* Alias Management */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Produktalias Verwaltung</h3>
              <p className="text-xs text-gray-500 mt-1">Setzt alle Produktalias auf ihre ursprünglichen Rohnames zurück</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmType("alias")}
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading}
              className="w-full gap-2"
            >
              {aliasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {aliasLoading ? "Wird gelöscht..." : "Alle Alias löschen"}
            </Button>
          </div>

          {/* Note about future features */}
          <div className="rounded-md bg-blue-50 p-3 border border-blue-200">
            <p className="text-xs text-blue-800">
              <strong>Zukünftige Features:</strong> DB-Backup, Statistik-Reset, Produktlisten-Reset, Import-Logs
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AVIS Confirmation Dialog */}
      <AlertDialog open={confirmType === "avis"} onOpenChange={(open) => !open && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AVIS-Datenbank löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600 font-medium">
              ⚠️ Dies löscht ALLE AVIS-Importe, Matches und automatisch gesetzten Alias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAvis}
            disabled={avisLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {avisLoading ? "Wird gelöscht..." : "Ja, löschen"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bons Reset Confirmation Dialog */}
      <AlertDialog open={confirmType === "bons"} onOpenChange={(open) => !open && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bons-Datenbank komplett löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600 font-medium">
              ⚠️ Dies löscht ALLE Bons, Artikel, AVIS-Matches, Produktaliase und den Import-Log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteBons}
            disabled={bonsLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {bonsLoading ? "Wird gelöscht..." : "Ja, alles löschen"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* Konto Confirmation Dialog */}
      <AlertDialog open={confirmType === "konto"} onOpenChange={(open) => !open && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alle Kontoauszüge löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600 font-medium">
              ⚠️ Dies löscht ALLE importierten Kontoauszüge, Transaktionen und deren Verknüpfungen zu Bons.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteKonto}
            disabled={kontoLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {kontoLoading ? "Wird gelöscht..." : "Ja, löschen"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alias Confirmation Dialog */}
      <AlertDialog open={confirmType === "alias"} onOpenChange={(open) => !open && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alle Alias löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600 font-medium">
              ⚠️ Dies setzt alle Produktalias auf ihre ursprünglichen Rohnames zurück.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAlias}
            disabled={aliasLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {aliasLoading ? "Wird gelöscht..." : "Ja, löschen"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
