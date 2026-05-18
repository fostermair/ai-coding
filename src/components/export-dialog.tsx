"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle, Download, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateFrom?: string
  dateTo?: string
}

export function ExportDialog({
  open,
  onOpenChange,
  dateFrom: initialFrom = "",
  dateTo: initialTo = "",
}: ExportDialogProps) {
  const [dateFrom, setDateFrom] = useState(initialFrom)
  const [dateTo, setDateTo] = useState(initialTo)
  const [useAlias, setUseAlias] = useState(true)
  const [loadingCsv, setLoadingCsv] = useState(false)
  const [loadingXlsx, setLoadingXlsx] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async (format: "csv" | "xlsx") => {
    setError(null)

    // Validate dates
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError("Start-Datum muss vor End-Datum liegen")
      return
    }

    if (format === "csv") setLoadingCsv(true)
    else setLoadingXlsx(true)

    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set("from", dateFrom)
      if (dateTo) params.set("to", dateTo)
      params.set("useAlias", useAlias ? "true" : "false")

      const url = `/api/export/${format}?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Export fehlgeschlagen (${response.status})`)
      }

      // Get filename from header or use default
      const contentDisposition = response.headers.get("content-disposition")
      let filename = `ebon-export-${new Date().toISOString().split("T")[0]}.${format}`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/)
        if (match) filename = match[1]
      }

      // Download file
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      if (format === "csv") setLoadingCsv(false)
      else setLoadingXlsx(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Daten exportieren</DialogTitle>
          <DialogDescription>
            Wählen Sie Format, Zeitraum und Optionen für den Export
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Von (optional)</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Bis (optional)</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Alias Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="useAlias"
              checked={useAlias}
              onCheckedChange={(checked) => setUseAlias(checked as boolean)}
            />
            <Label htmlFor="useAlias" className="font-normal cursor-pointer">
              Alias-Namen verwenden (wenn vorhanden)
            </Label>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loadingCsv || loadingXlsx}
          >
            Abbrechen
          </Button>
          <Button
            onClick={() => handleExport("csv")}
            disabled={loadingXlsx}
            variant="outline"
          >
            {loadingCsv ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                CSV wird erstellt...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                CSV exportieren
              </>
            )}
          </Button>
          <Button
            onClick={() => handleExport("xlsx")}
            disabled={loadingCsv}
          >
            {loadingXlsx ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Excel wird erstellt...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Excel exportieren
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
