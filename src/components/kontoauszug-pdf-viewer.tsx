"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { X } from "lucide-react"
import { formatEuro } from "@/lib/format"

const PdfViewer = dynamic(() => import("@/components/pdf-viewer"), {
  ssr: false,
  loading: () => <div>PDF wird geladen...</div>,
})

interface Transaction {
  id: number
  buchungsdatum: string
  betrag_cents: number
  beschreibung?: string
  [key: string]: unknown
}

interface KontoauszugPdfViewerProps {
  periode: string
  highlightTx: Transaction | null
  onClose: () => void
}

function formatDateForSearch(dateStr: string): string {
  if (!dateStr || dateStr.length !== 10) return ""
  const [year, month, day] = dateStr.split("-")
  return `${day}.${month}.${year}`
}

export function KontoauszugPdfViewer({ periode, highlightTx, onClose }: KontoauszugPdfViewerProps) {
  const highlightString = useMemo(() => {
    if (!highlightTx) return undefined

    const searchDate = formatDateForSearch(highlightTx.buchungsdatum)
    return searchDate
  }, [highlightTx])

  return (
    <div className="flex flex-col h-[600px] bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
        <div className="text-sm font-medium text-gray-600">
          {highlightTx ? "Transaktionsdetails im PDF" : "Kontoauszug"}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
          title="PDF schließen"
        >
          <X size={18} />
        </button>
      </div>

      <PdfViewer
        src={`/api/konto/statements/${periode}/pdf`}
        highlight={highlightString}
        toolbar={false}
        className="flex-1"
      />
    </div>
  )
}
