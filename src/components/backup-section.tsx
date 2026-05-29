"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

export function BackupSection() {
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("lastBackupTimestamp")
    if (stored) {
      setLastBackupTime(stored)
    }
  }, [])

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
      setConfirmRestore(false)
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-100 bg-white p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Datenbackup Verwaltung</h3>
          <p className="text-sm text-gray-600 mb-4">
            Erstelle ein Backup aller Daten oder stelle ein früheres Backup wieder her
          </p>

          {message && (
            <Alert className={`mb-4 ${message.type === "success" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
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

          {lastBackupTime && (
            <p className="text-sm text-gray-600 mb-4">
              <strong>Letztes Backup:</strong> {lastBackupTime}
            </p>
          )}
          {!lastBackupTime && (
            <p className="text-sm text-gray-500 mb-4">Kein Backup vorhanden</p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleCreateBackup}
              disabled={backupLoading || restoreLoading}
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {backupLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {backupLoading ? "Wird erstellt..." : "Backup erstellen"}
            </Button>

            <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer text-sm font-medium">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (file) {
                    pendingFileRef.current = file
                    setConfirmRestore(true)
                  }
                  e.currentTarget.value = ""
                }}
                disabled={restoreLoading || backupLoading}
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

        <Alert className="border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Hinweis:</strong> Backups enthalten alle Ihre Daten (Bons, Transaktionen, Konfigurationen). Ein Restore lädt die gesamte Datenbank neu.
          </AlertDescription>
        </Alert>
      </div>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup wiederherstellen?</AlertDialogTitle>
            <AlertDialogDescription className="text-orange-600 font-medium">
              ⚠️ Dies ersetzt die aktuelle Datenbank mit dem Backup-Inhalt
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-gray-700 px-4">
            Die App wird nach dem Restore neu geladen. Stellen Sie sicher, dass keine Importe laufen.
          </p>
          <div className="flex gap-3 justify-end pt-4">
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingFileRef.current) {
                  handleRestoreBackup(pendingFileRef.current)
                }
              }}
              disabled={restoreLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {restoreLoading ? "Wird wiederhergestellt..." : "Ja, Restore durchführen"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
