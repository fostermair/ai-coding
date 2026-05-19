"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  AlertCircle,
  Circle,
  RefreshCw,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { AvisConfirmationDialog } from "@/components/avis-confirmation-dialog"

type ImportStatus = "pending" | "uploading" | "success" | "duplicate" | "error"

interface ImportResult {
  date?: string
  store?: string
  items?: number
  total?: string
}

interface MatchResult {
  avisName: string
  avisQty: number
  avisPrice: number
  ebonRawName: string
  ebonQty: number
  ebonPrice: number
  ebonDate: string
  confidence: number
}

interface AvisImportResult {
  auto_set: number
  pending_approval: number
  unmatched: number
  errors: number
  pending_matches: MatchResult[]
  unmatched_items: Array<{ name: string; price: number; date: string }>
  import_log_id: string
}

interface QueueItem {
  id: string
  filename: string
  status: ImportStatus
  result?: ImportResult
  error?: string
}

interface SyncDetail {
  title: string
  status: "imported" | "duplicate" | "error"
  message?: string
}

interface SyncResult {
  imported: number
  duplicates: number
  errors: number
  details: SyncDetail[]
  message?: string
}

export function ImportZone() {
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [paperlessConfigured, setPaperlessConfigured] = useState(true)

  // AVIS state
  const [isAvisDragging, setIsAvisDragging] = useState(false)
  const [avisQueue, setAvisQueue] = useState<QueueItem[]>([])
  const avisFileInputRef = useRef<HTMLInputElement>(null)
  const [isAvisSyncing, setIsAvisSyncing] = useState(false)
  const [avisConfirmationOpen, setAvisConfirmationOpen] = useState(false)
  const [pendingAvisMatches, setPendingAvisMatches] = useState<MatchResult[]>([])
  const [pendingAvisUnmatched, setPendingAvisUnmatched] = useState<
    Array<{ name: string; price: number; date: string }>
  >([])
  const [avisImportLogId, setAvisImportLogId] = useState<string | null>(null)

  const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    )
  }, [])

  const uploadFile = useCallback(
    async (item: QueueItem, file: File) => {
      updateItem(item.id, { status: "uploading" })

      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/import", { method: "POST", body: formData })
        const data = await res.json()

        if (res.status === 409) {
          updateItem(item.id, { status: "duplicate", error: data.message })
        } else if (!res.ok) {
          updateItem(item.id, {
            status: "error",
            error: data.message ?? "Unbekannter Fehler",
          })
        } else {
          updateItem(item.id, { status: "success", result: data })
        }
      } catch {
        updateItem(item.id, {
          status: "error",
          error: "Backend noch nicht verfügbar – bitte /backend ausführen",
        })
      }
    },
    [updateItem]
  )

  const addFiles = useCallback(
    (files: File[]) => {
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      )
      if (pdfs.length === 0) return

      const newItems: QueueItem[] = pdfs.map((f) => ({
        id: `${f.name}-${Date.now()}-${Math.random()}`,
        filename: f.name,
        status: "pending" as ImportStatus,
      }))

      setQueue((prev) => [...prev, ...newItems])

      // Upload files one by one with a small stagger
      newItems.forEach((item, i) => {
        setTimeout(() => uploadFile(item, pdfs[i]), i * 150)
      })
    },
    [uploadFile]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles]
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    // Only trigger when leaving the drop zone itself (not child elements)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ""
  }

  const clearCompleted = () => {
    setQueue((prev) =>
      prev.filter(
        (item) => item.status === "pending" || item.status === "uploading"
      )
    )
  }

  const hasCompleted = queue.some(
    (item) =>
      item.status === "success" ||
      item.status === "duplicate" ||
      item.status === "error"
  )

  const checkPaperlessConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/paperless/sync", { method: "POST" })
      const data = await res.json()
      if (data.configured === false) {
        setPaperlessConfigured(false)
      } else {
        setPaperlessConfigured(true)
      }
    } catch {
      setPaperlessConfigured(true)
    }
  }, [])

  const handlePaperlessSync = useCallback(async () => {
    setIsSyncing(true)
    setSyncResult(null)
    setSyncError(null)

    try {
      const res = await fetch("/api/paperless/sync", { method: "POST" })
      const data: SyncResult = await res.json()

      if (!res.ok) {
        setSyncError(data.message || "Fehler beim Sync")
      } else {
        setSyncResult(data)
      }
    } catch (e) {
      setSyncError("Netzwerkfehler – bitte versuche es später erneut")
    } finally {
      setIsSyncing(false)
    }
  }, [])

  // Check paperless config on mount
  useEffect(() => {
    checkPaperlessConfig()
  }, [checkPaperlessConfig])

  // AVIS handlers
  const updateAvisItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    setAvisQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    )
  }, [])

  const uploadAvisFile = useCallback(
    async (item: QueueItem, file: File) => {
      updateAvisItem(item.id, { status: "uploading" })

      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/avis/import", { method: "POST", body: formData })
        const data = await res.json()

        if (res.status === 409) {
          updateAvisItem(item.id, {
            status: "duplicate",
            error: "AVIS bereits importiert",
          })
        } else if (!res.ok) {
          updateAvisItem(item.id, {
            status: "error",
            error: (data as any).message ?? "Unbekannter Fehler",
          })
        } else {
          const avisResult = data as AvisImportResult
          updateAvisItem(item.id, {
            status: "success",
            result: {
              items: avisResult.auto_set + avisResult.pending_approval,
              total: `${avisResult.auto_set} automatisch, ${avisResult.pending_approval} zu überprüfen`,
            },
          })

          // Show confirmation dialog if there are pending matches
          if (avisResult.pending_approval > 0) {
            setPendingAvisMatches(avisResult.pending_matches)
            setPendingAvisUnmatched(avisResult.unmatched_items)
            setAvisImportLogId(avisResult.import_log_id)
            setAvisConfirmationOpen(true)
          }
        }
      } catch {
        updateAvisItem(item.id, {
          status: "error",
          error: "Backend noch nicht verfügbar – bitte /backend ausführen",
        })
      }
    },
    [updateAvisItem]
  )

  const addAvisFiles = useCallback(
    (files: File[]) => {
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      )
      if (pdfs.length === 0) return

      const newItems: QueueItem[] = pdfs.map((f) => ({
        id: `avis-${f.name}-${Date.now()}-${Math.random()}`,
        filename: f.name,
        status: "pending" as ImportStatus,
      }))

      setAvisQueue((prev) => [...prev, ...newItems])

      newItems.forEach((item, i) => {
        setTimeout(() => uploadAvisFile(item, pdfs[i]), i * 150)
      })
    },
    [uploadAvisFile]
  )

  const onAvisDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsAvisDragging(false)
      addAvisFiles(Array.from(e.dataTransfer.files))
    },
    [addAvisFiles]
  )

  const onAvisDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsAvisDragging(true)
  }

  const onAvisDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsAvisDragging(false)
    }
  }

  const onAvisFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addAvisFiles(Array.from(e.target.files))
    e.target.value = ""
  }

  const clearAvisCompleted = () => {
    setAvisQueue((prev) =>
      prev.filter(
        (item) => item.status === "pending" || item.status === "uploading"
      )
    )
  }

  const hasAvisCompleted = avisQueue.some(
    (item) =>
      item.status === "success" ||
      item.status === "duplicate" ||
      item.status === "error"
  )

  const handleAvisPaperlessSync = useCallback(async () => {
    setIsAvisSyncing(true)

    try {
      const res = await fetch("/api/paperless/avis-sync", { method: "POST" })
      const data = await res.json()

      if (!res.ok) {
        alert("Fehler beim AVIS-Sync: " + (data.message || "Unbekannter Fehler"))
      } else {
        alert(
          `AVIS-Sync abgeschlossen: ${data.auto_set} automatisch, ${data.pending_approval} zu überprüfen`
        )
      }
    } catch {
      alert("Netzwerkfehler – bitte versuche es später erneut")
    } finally {
      setIsAvisSyncing(false)
    }
  }, [])

  const handleAvisConfirmation = useCallback(
    async (confirmedKeys: string[], rejectedKeys: string[]) => {
      if (!avisImportLogId) return

      // Map keys back to match objects
      const confirmedMatches = confirmedKeys
        .map((key) => {
          const index = parseInt(key.split("-")[1])
          return pendingAvisMatches[index]
        })
        .filter((m) => m)

      const rejectedMatches = rejectedKeys
        .map((key) => {
          const index = parseInt(key.split("-")[1])
          return pendingAvisMatches[index]
        })
        .filter((m) => m)

      try {
        const res = await fetch("/api/avis/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            import_log_id: avisImportLogId,
            confirmed_matches: confirmedMatches.map((m) => ({
              ebonRawName: m.ebonRawName,
              avisName: m.avisName,
            })),
            rejected_matches: rejectedMatches.map((m) => ({
              ebonRawName: m.ebonRawName,
              avisName: m.avisName,
            })),
          }),
        })

        if (!res.ok) {
          alert("Fehler beim Speichern: " + (await res.text()))
          return
        }

        setPendingAvisMatches([])
        setPendingAvisUnmatched([])
        setAvisImportLogId(null)
        alert(`${confirmedMatches.length} Zuordnung(en) gespeichert`)
      } catch (e) {
        alert("Netzwerkfehler beim Speichern")
      }
    },
    [avisImportLogId, pendingAvisMatches]
  )

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all select-none",
          isDragging
            ? "border-blue-400 bg-blue-50 scale-[1.01]"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
        <Upload
          className={cn(
            "mx-auto h-10 w-10 mb-3 transition-colors",
            isDragging ? "text-blue-400" : "text-gray-300"
          )}
        />
        <p className="font-medium text-gray-700">
          {isDragging ? "Loslassen zum Importieren" : "PDFs hier ablegen"}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          oder klicken zum Auswählen · REWE eBon PDFs · Mehrfachauswahl möglich
        </p>
      </div>

      {/* Paperless Sync Section */}
      {paperlessConfigured && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">paperless-ngx Synchronisierung</h3>
            </div>
            <Button
              onClick={handlePaperlessSync}
              disabled={isSyncing}
              className="w-full"
              variant="outline"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Synchronisiere ...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Aus paperless-ngx synchronisieren
                </>
              )}
            </Button>

            {syncResult && (
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-800">Sync-Ergebnis</p>
                  <p className="text-xs text-green-700 mt-1">
                    {syncResult.imported} importiert
                    {syncResult.duplicates > 0 && ` · ${syncResult.duplicates} Duplikat${syncResult.duplicates !== 1 ? "e" : ""}`}
                    {syncResult.errors > 0 && ` · ${syncResult.errors} Fehler`}
                  </p>
                </div>

                {syncResult.details.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {syncResult.details.map((detail, i) => (
                      <div
                        key={i}
                        className="text-xs p-2 rounded border"
                        style={{
                          borderColor:
                            detail.status === "imported"
                              ? "#dcfce7"
                              : detail.status === "duplicate"
                                ? "#fed7aa"
                                : "#fee2e2",
                          backgroundColor:
                            detail.status === "imported"
                              ? "#f0fdf4"
                              : detail.status === "duplicate"
                                ? "#fffbeb"
                                : "#fef2f2",
                        }}
                      >
                        <p className="font-medium text-gray-900">{detail.title}</p>
                        {detail.message && (
                          <p className="text-gray-600 mt-0.5">{detail.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {syncError && (
              <Alert variant="destructive">
                <AlertDescription>{syncError}</AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}

      {/* Queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">
              {queue.length} Datei{queue.length !== 1 ? "en" : ""}
            </p>
            {hasCompleted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                className="text-gray-400 hover:text-gray-600 h-7 text-xs"
              >
                Abgeschlossene ausblenden
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {queue.map((item) => (
              <QueueItemCard key={item.id} item={item} />
            ))}
          </div>

          {/* Summary line */}
          {queue.length > 1 && (
            <ImportSummary queue={queue} />
          )}
        </div>
      )}

      {/* AVIS Section */}
      <Separator className="my-6" />
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">
          REWE Abholavis importieren
        </h2>
        <p className="text-sm text-gray-600">
          AVIS-PDFs ermöglichen automatische Zuordnung von Produktnamen zu deinen eBon-Artikeln.
        </p>

        {/* AVIS Drop Zone */}
        <div
          onDrop={onAvisDrop}
          onDragOver={onAvisDragOver}
          onDragLeave={onAvisDragLeave}
          onClick={() => avisFileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all select-none",
            isAvisDragging
              ? "border-blue-400 bg-blue-50 scale-[1.01]"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
          )}
        >
          <input
            ref={avisFileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={onAvisFileChange}
          />
          <Upload
            className={cn(
              "mx-auto h-10 w-10 mb-3 transition-colors",
              isAvisDragging ? "text-blue-400" : "text-gray-300"
            )}
          />
          <p className="font-medium text-gray-700">
            {isAvisDragging ? "Loslassen zum Importieren" : "AVIS-PDFs hier ablegen"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            oder klicken zum Auswählen · REWE Abholavis PDFs · Mehrfachauswahl möglich
          </p>
        </div>

        {/* AVIS Paperless Sync */}
        {paperlessConfigured && (
          <div className="space-y-2">
            <Button
              onClick={handleAvisPaperlessSync}
              disabled={isAvisSyncing}
              className="w-full"
              variant="outline"
            >
              {isAvisSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  AVIS synchronisiere ...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  AVIS aus paperless-ngx synchronisieren
                </>
              )}
            </Button>
          </div>
        )}

        {/* AVIS Queue */}
        {avisQueue.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-600">
                {avisQueue.length} AVIS-Datei{avisQueue.length !== 1 ? "en" : ""}
              </p>
              {hasAvisCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAvisCompleted}
                  className="text-gray-400 hover:text-gray-600 h-7 text-xs"
                >
                  Abgeschlossene ausblenden
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {avisQueue.map((item) => (
                <QueueItemCard key={item.id} item={item} />
              ))}
            </div>

            {avisQueue.length > 1 && (
              <ImportSummary queue={avisQueue} />
            )}
          </div>
        )}
      </div>

      {/* AVIS Confirmation Dialog */}
      <AvisConfirmationDialog
        open={avisConfirmationOpen}
        onOpenChange={setAvisConfirmationOpen}
        matches={pendingAvisMatches}
        unmatched={pendingAvisUnmatched}
        onConfirm={handleAvisConfirmation}
      />
    </div>
  )
}

function QueueItemCard({ item }: { item: QueueItem }) {
  return (
    <Card className="shadow-none border-gray-100">
      <CardContent className="flex items-start gap-3 py-3 px-4">
        <div className="mt-0.5 flex-shrink-0">
          <StatusIcon status={item.status} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {item.filename}
          </p>
          {item.status === "success" && item.result && (
            <p className="text-xs text-gray-500 mt-0.5">
              {item.result.date && <span>{item.result.date} · </span>}
              {item.result.store && <span>{item.result.store} · </span>}
              {item.result.items !== undefined && (
                <span>{item.result.items} Artikel · </span>
              )}
              {item.result.total && <span>{item.result.total} EUR</span>}
            </p>
          )}
          {(item.status === "error" || item.status === "duplicate") &&
            item.error && (
              <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
            )}
        </div>
        <StatusBadge status={item.status} />
      </CardContent>
    </Card>
  )
}

function ImportSummary({ queue }: { queue: QueueItem[] }) {
  const success = queue.filter((i) => i.status === "success").length
  const duplicate = queue.filter((i) => i.status === "duplicate").length
  const error = queue.filter((i) => i.status === "error").length
  const pending = queue.filter(
    (i) => i.status === "pending" || i.status === "uploading"
  ).length

  if (pending > 0) return null

  return (
    <div className="flex gap-4 text-xs text-gray-500 pt-1 pl-1">
      {success > 0 && (
        <span className="text-green-600 font-medium">✓ {success} importiert</span>
      )}
      {duplicate > 0 && (
        <span className="text-amber-500">{duplicate} Duplikat{duplicate !== 1 ? "e" : ""}</span>
      )}
      {error > 0 && (
        <span className="text-red-500">{error} Fehler</span>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: ImportStatus }) {
  switch (status) {
    case "pending":
      return <Circle className="h-5 w-5 text-gray-200" />
    case "uploading":
      return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />
    case "duplicate":
      return <AlertCircle className="h-5 w-5 text-amber-400" />
    case "error":
      return <XCircle className="h-5 w-5 text-red-400" />
  }
}

function StatusBadge({ status }: { status: ImportStatus }) {
  const config: Record<ImportStatus, { label: string; className: string }> = {
    pending: { label: "Wartend", className: "bg-gray-100 text-gray-500 border-0" },
    uploading: { label: "Verarbeitung …", className: "bg-blue-50 text-blue-600 border-0" },
    success: { label: "Importiert", className: "bg-green-50 text-green-600 border-0" },
    duplicate: { label: "Duplikat", className: "bg-amber-50 text-amber-600 border-0" },
    error: { label: "Fehler", className: "bg-red-50 text-red-500 border-0" },
  }
  const { label, className } = config[status]
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs flex-shrink-0 font-normal", className)}
    >
      {label}
    </Badge>
  )
}
