"use client"

import { useState, useCallback, useRef } from "react"
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
} from "lucide-react"

type ImportStatus = "pending" | "uploading" | "success" | "duplicate" | "error"

interface ImportResult {
  date?: string
  store?: string
  items?: number
  total?: string
}

interface QueueItem {
  id: string
  filename: string
  status: ImportStatus
  result?: ImportResult
  error?: string
}

export function ImportZone() {
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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
