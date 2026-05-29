"use client"

import { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, SkipForward, Pencil, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AliasSuggestion {
  raw_name: string
  suggestion: string | null
  confidence: number
}

interface SuggestionRowState {
  rawName: string
  suggestion: string | null
  confidence: number
  status: "pending" | "accepted" | "skipped"
  showManualInput: boolean
  customAlias: string
}

interface AliasSuggestionDialogProps {
  open: boolean
  suggestions: AliasSuggestion[]
  onConfirm: (rawName: string, alias: string, source: "suggested" | "manual") => Promise<void>
  onSkip: (rawName: string) => void
  onClose: () => void
}

const HIGH_CONFIDENCE = 90
const LOW_CONFIDENCE = 50

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= HIGH_CONFIDENCE) {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-normal">
        {confidence} %
      </Badge>
    )
  }
  if (confidence >= LOW_CONFIDENCE) {
    return (
      <Badge variant="secondary" className="text-xs font-normal">
        {confidence} %
      </Badge>
    )
  }
  return (
    <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs font-normal">
      {confidence} % · niedrige Konfidenz
    </Badge>
  )
}

export function AliasSuggestionDialog({
  open,
  suggestions,
  onConfirm,
  onSkip,
  onClose,
}: AliasSuggestionDialogProps) {
  const [rows, setRows] = useState<SuggestionRowState[]>(() =>
    suggestions.map((s) => ({
      rawName: s.raw_name,
      suggestion: s.suggestion,
      confidence: s.confidence,
      status: "pending",
      showManualInput: false,
      customAlias: s.suggestion ?? "",
    }))
  )
  const [saving, setSaving] = useState<Set<string>>(new Set())

  // Sync rows when suggestions prop changes (new dialog open)
  const [lastSuggestions, setLastSuggestions] = useState(suggestions)
  if (suggestions !== lastSuggestions) {
    setLastSuggestions(suggestions)
    setRows(
      suggestions.map((s) => ({
        rawName: s.raw_name,
        suggestion: s.suggestion,
        confidence: s.confidence,
        status: "pending",
        showManualInput: false,
        customAlias: s.suggestion ?? "",
      }))
    )
  }

  const updateRow = useCallback((rawName: string, update: Partial<SuggestionRowState>) => {
    setRows((prev) => prev.map((r) => (r.rawName === rawName ? { ...r, ...update } : r)))
  }, [])

  const handleAccept = useCallback(
    async (row: SuggestionRowState) => {
      const alias = row.suggestion
      if (!alias) return
      setSaving((s) => new Set(s).add(row.rawName))
      try {
        await onConfirm(row.rawName, alias, "suggested")
        updateRow(row.rawName, { status: "accepted" })
      } finally {
        setSaving((s) => {
          const next = new Set(s)
          next.delete(row.rawName)
          return next
        })
      }
    },
    [onConfirm, updateRow]
  )

  const handleManualSave = useCallback(
    async (row: SuggestionRowState) => {
      const alias = row.customAlias.trim()
      if (!alias) return
      setSaving((s) => new Set(s).add(row.rawName))
      try {
        await onConfirm(row.rawName, alias, "manual")
        updateRow(row.rawName, { status: "accepted", showManualInput: false })
      } finally {
        setSaving((s) => {
          const next = new Set(s)
          next.delete(row.rawName)
          return next
        })
      }
    },
    [onConfirm, updateRow]
  )

  const handleSkip = useCallback(
    (row: SuggestionRowState) => {
      onSkip(row.rawName)
      updateRow(row.rawName, { status: "skipped" })
    },
    [onSkip, updateRow]
  )

  const pending = rows.filter((r) => r.status === "pending")
  const done = rows.filter((r) => r.status !== "pending")

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Alias-Vorschläge ({rows.filter((r) => r.status === "pending").length} offen)
          </DialogTitle>
          <DialogDescription>
            Neue Artikel ohne Alias wurden importiert. Überprüfe die Vorschläge und übernehme
            sie per Klick oder gib einen eigenen Alias ein.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {pending.map((row) => {
            const isSaving = saving.has(row.rawName)
            const hasSuggestion = !!row.suggestion

            return (
              <div
                key={row.rawName}
                className={cn(
                  "rounded-lg border p-3 space-y-2 transition-colors",
                  row.confidence >= HIGH_CONFIDENCE
                    ? "border-green-200 bg-green-50/50"
                    : row.confidence < LOW_CONFIDENCE && hasSuggestion
                      ? "border-orange-100 bg-orange-50/30"
                      : "border-gray-200 bg-white"
                )}
              >
                {/* Raw name + confidence */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-mono text-gray-600 truncate max-w-[50%]">
                    {row.rawName}
                  </span>
                  {hasSuggestion && <ConfidenceBadge confidence={row.confidence} />}
                </div>

                {/* Suggestion display */}
                {hasSuggestion && !row.showManualInput && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 flex-1">
                      → {row.suggestion}
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => updateRow(row.rawName, { showManualInput: true })}
                        disabled={isSaving}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Anderer Alias
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-gray-400 hover:text-gray-600"
                        onClick={() => handleSkip(row)}
                        disabled={isSaving}
                      >
                        <SkipForward className="h-3 w-3 mr-1" />
                        Überspringen
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => handleAccept(row)}
                        disabled={isSaving}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Übernehmen
                      </Button>
                    </div>
                  </div>
                )}

                {/* No suggestion — straight to manual input */}
                {!hasSuggestion && !row.showManualInput && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 italic flex-1">Kein Vorschlag</span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => updateRow(row.rawName, { showManualInput: true, customAlias: "" })}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Alias eingeben
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-gray-400 hover:text-gray-600"
                        onClick={() => handleSkip(row)}
                      >
                        <SkipForward className="h-3 w-3 mr-1" />
                        Überspringen
                      </Button>
                    </div>
                  </div>
                )}

                {/* Manual input mode */}
                {row.showManualInput && (
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-7 text-sm flex-1"
                      placeholder="Produktname eingeben …"
                      value={row.customAlias}
                      onChange={(e) => updateRow(row.rawName, { customAlias: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleManualSave(row)
                        if (e.key === "Escape")
                          updateRow(row.rawName, {
                            showManualInput: false,
                            customAlias: row.suggestion ?? "",
                          })
                      }}
                      autoFocus
                      disabled={isSaving}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-gray-400"
                      onClick={() =>
                        updateRow(row.rawName, {
                          showManualInput: false,
                          customAlias: row.suggestion ?? "",
                        })
                      }
                      disabled={isSaving}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleManualSave(row)}
                      disabled={isSaving || !row.customAlias.trim()}
                    >
                      Speichern
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {/* Completed rows summary */}
          {done.length > 0 && (
            <>
              {pending.length > 0 && <Separator />}
              <div className="space-y-1">
                {done.map((row) => (
                  <div
                    key={row.rawName}
                    className={cn(
                      "rounded-lg border px-3 py-2 flex items-center justify-between gap-2 opacity-60",
                      row.status === "accepted" ? "border-green-200 bg-green-50" : "border-gray-100 bg-gray-50"
                    )}
                  >
                    <span className="text-xs font-mono text-gray-500 truncate">{row.rawName}</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-xs flex-shrink-0",
                        row.status === "accepted"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-500"
                      )}
                    >
                      {row.status === "accepted" ? "Gespeichert" : "Übersprungen"}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <Separator />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {pending.length === 0 ? "Schließen" : "Alle überspringen & schließen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
