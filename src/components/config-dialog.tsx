"use client"

import { useState, useRef, useEffect } from "react"
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
import { AlertCircle, CheckCircle2, Download, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"

interface ConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ConfirmType = "avis" | "alias" | "konto" | "bons" | "bestellung" | "restore" | null

export function ConfigDialog({ open, onOpenChange }: ConfigDialogProps) {
  const [confirmType, setConfirmType] = useState<ConfirmType>(null)
  const [avisLoading, setAvisLoading] = useState(false)
  const [aliasLoading, setAliasLoading] = useState(false)
  const [kontoLoading, setKontoLoading] = useState(false)
  const [bonsLoading, setBonsLoading] = useState(false)
  const [bestellungLoading, setBestellungLoading] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("lastBackupTimestamp")
    if (stored) {
      setLastBackupTime(stored)
    }
  }, [open])

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

  const handleDeleteBestellung = async () => {
    setBestellungLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/bestellung/reset", { method: "DELETE" })
      const data = await res.json()

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.message || "Fehler beim Löschen der Bestellungen",
        })
        return
      }

      setMessage({ type: "success", text: data.message })
      toast.success(data.message)
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ type: "error", text: "Netzwerkfehler beim Löschen aufgetreten" })
    } finally {
      setBestellungLoading(false)
      setConfirmType(null)
    }
  }

  const handleCreateBackup = async () => {
    setBackupLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/backup")
      if (!res.ok) {
        setMessage({
          type: "error",
          text: "Fehler beim Erstellen des Backups",
        })
        return
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") || "backup.zip"
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      // Update last backup timestamp
      const now = new Date().toLocaleString("de-DE")
      localStorage.setItem("lastBackupTimestamp", now)
      setLastBackupTime(now)

      setMessage({
        type: "success",
        text: "Backup erstellt und heruntergeladen",
      })
      toast.success("Backup erstellt und heruntergeladen")
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage({
        type: "error",
        text: "Fehler beim Erstellen des Backups",
      })
    } finally {
      setBackupLoading(false)
    }
  }

  const handleRestoreBackup = async (file: File) => {
    setRestoreLoading(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/backup/restore", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "Fehler beim Wiederherstellen des Backups",
        })
        return
      }

      setMessage({
        type: "success",
        text: data.message,
      })
      toast.success(data.message)

      // Reload page after 1 second
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (e) {
      setMessage({
        type: "error",
        text: "Fehler beim Verarbeiten des Backups",
      })
    } finally {
      setRestoreLoading(false)
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
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading || bestellungLoading}
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
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading || bestellungLoading}
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
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading || bestellungLoading}
              className="w-full gap-2"
            >
              {kontoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {kontoLoading ? "Wird gelöscht..." : "Alle Kontoauszüge löschen"}
            </Button>
          </div>

          <Separator />

          {/* Bestellung Management */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Bestellungs-Daten Verwaltung</h3>
              <p className="text-xs text-gray-500 mt-1">
                Löscht alle importierten Bestellbestätigungen und Artikel-Daten
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmType("bestellung")}
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading || bestellungLoading}
              className="w-full gap-2"
            >
              {bestellungLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {bestellungLoading ? "Wird gelöscht..." : "Bestellungs-Daten löschen"}
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
              disabled={avisLoading || aliasLoading || kontoLoading || bonsLoading || bestellungLoading}
              className="w-full gap-2"
            >
              {aliasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {aliasLoading ? "Wird gelöscht..." : "Alle Alias löschen"}
            </Button>
          </div>

          <Separator />

          {/* Backup Management */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Datenbackup Verwaltung</h3>
              <p className="text-xs text-gray-500 mt-1">
                Erstellen Sie ein Backup aller Daten oder stellen Sie ein früheres Backup wieder her
              </p>
            </div>

            {lastBackupTime && (
              <p className="text-xs text-gray-600">
                <strong>Letztes Backup:</strong> {lastBackupTime}
              </p>
            )}
            {!lastBackupTime && (
              <p className="text-xs text-gray-500">Kein Backup vorhanden</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCreateBackup}
                disabled={
                  backupLoading ||
                  restoreLoading ||
                  avisLoading ||
                  aliasLoading ||
                  kontoLoading ||
                  bonsLoading ||
                  bestellungLoading
                }
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {backupLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {backupLoading ? "Wird erstellt..." : "Backup erstellen"}
              </button>

              <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0]
                    if (file) {
                      pendingFileRef.current = file
                      setConfirmType("restore")
                    }
                    e.currentTarget.value = ""
                  }}
                  disabled={
                    restoreLoading ||
                    backupLoading ||
                    avisLoading ||
                    aliasLoading ||
                    kontoLoading ||
                    bonsLoading ||
                    bestellungLoading
                  }
                  className="hidden"
                />
                {restoreLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {restoreLoading ? "Wird wiederhergestellt..." : "Backup laden"}
              </label>
            </div>
          </div>

          {/* Note about future features */}
          <div className="rounded-md bg-blue-50 p-3 border border-blue-200">
            <p className="text-xs text-blue-800">
              <strong>Zukünftige Features:</strong> Statistik-Reset, Produktlisten-Reset, Import-Logs
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

      {/* Bestellung Confirmation Dialog */}
      <AlertDialog open={confirmType === "bestellung"} onOpenChange={(open) => !open && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bestellungs-Daten löschen?</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600 font-medium">
              ⚠️ Dies löscht ALLE importierten Bestellbestätigungen und Artikel-Daten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">Diese Aktion kann nicht rückgängig gemacht werden. Die PDF-Dateien bleiben erhalten.</p>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteBestellung}
            disabled={bestellungLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {bestellungLoading ? "Wird gelöscht..." : "Ja, löschen"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={confirmType === "restore"} onOpenChange={(open) => !open && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup wiederherstellen?</AlertDialogTitle>
            <AlertDialogDescription className="text-red-600 font-medium">
              ⚠️ Alle aktuellen Daten werden überschrieben und können nicht wiederhergestellt werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingFileRef.current) {
                handleRestoreBackup(pendingFileRef.current)
              } else {
                toast.error("Keine Datei ausgewählt")
                setConfirmType(null)
              }
            }}
            disabled={restoreLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {restoreLoading ? "Wird wiederhergestellt..." : "Ja, Backup laden"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
