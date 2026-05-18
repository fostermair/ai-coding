"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { ExportDialog } from "@/components/export-dialog"

export function StatistikenHeader() {
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Statistiken</h1>
          <p className="text-gray-500 mt-1">
            Monatliche Ausgaben &middot; Häufigste Produkte &middot; Rabatt-Tracking &middot; MwSt-Aufteilung
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setExportDialogOpen(true)}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportieren
        </Button>
      </div>

      <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
    </>
  )
}
