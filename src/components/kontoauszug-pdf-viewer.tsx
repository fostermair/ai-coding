"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, AlertCircle, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Transaction {
  id: number
  buchungsdatum: string
  betrag_cents: number
  [key: string]: unknown
}

interface KontoauszugPdfViewerProps {
  periode: string
  highlightTx: Transaction | null
  onClose: () => void
}

export function KontoauszugPdfViewer({ periode, highlightTx, onClose }: KontoauszugPdfViewerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const formatDateForSearch = (dateStr: string): string => {
    // dateStr is YYYY-MM-DD, convert to DD.MM.YYYY
    if (!dateStr || dateStr.length !== 10) return ""
    const [year, month, day] = dateStr.split("-")
    return `${day}.${month}.${year}`
  }

  const formatAmountForSearch = (cents: number): string => {
    // -2550 → "-25,50"
    const sign = cents < 0 ? "-" : ""
    const absValue = Math.abs(cents)
    const euros = Math.floor(absValue / 100)
    const centPart = absValue % 100
    return `${sign}${euros},${centPart.toString().padStart(2, "0")}`
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false)
      setError(null)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  const handleIframeLoad = () => {
    setLoading(false)
    setError(null)

    // Try to highlight transaction in PDF (simple text search via iframe window)
    if (highlightTx && iframeRef.current?.contentWindow) {
      try {
        const searchDate = formatDateForSearch(highlightTx.buchungsdatum)
        const searchAmount = formatAmountForSearch(highlightTx.betrag_cents)

        // Note: Direct iframe text manipulation is limited due to sandboxing,
        // but we can log for debugging purposes
        console.log(`Searching for transaction: ${searchDate} ${searchAmount}`)
      } catch (e) {
        console.warn("Could not highlight in iframe:", e)
      }
    }
  }

  const handleIframeError = () => {
    setLoading(false)
    setError("Fehler beim Laden des PDFs. Bitte versuchen Sie es später erneut.")
  }

  return (
    <div className="w-full border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header with close button */}
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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center h-[600px] bg-gray-50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <p className="text-sm text-gray-600">PDF wird geladen...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* PDF Document via iframe */}
      {!error && (
        <div
          ref={containerRef}
          className="overflow-auto bg-gray-100 relative"
          style={{ height: "600px" }}
        >
          <iframe
            ref={iframeRef}
            src={`/api/konto/statements/${periode}/pdf`}
            className="w-full h-full border-0"
            title={`Kontoauszug ${periode}`}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      )}
    </div>
  )
}
