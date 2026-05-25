"use client"

import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import { useState, useEffect, useRef, useCallback } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Loader2, AlertCircle, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatEuro } from "@/lib/format"

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js"
}

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

function getRowItems(items: HTMLElement[], anchor: HTMLElement): HTMLElement[] {
  const anchorTop = anchor.getBoundingClientRect().top
  return items.filter(item => Math.abs(item.getBoundingClientRect().top - anchorTop) <= 3)
}

export function KontoauszugPdfViewer({ periode, highlightTx, onClose }: KontoauszugPdfViewerProps) {
  console.log("[PDF] Component render — periode=", periode, "highlightTx=", highlightTx?.id ?? null)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHighlights = useCallback(() => {
    containerRef.current?.querySelectorAll(".tx-highlight").forEach((el) => el.remove())
  }, [])

  const trySearchAndHighlight = useCallback((tx: Transaction): boolean => {
    if (!containerRef.current) return false

    const searchDate = formatDateForSearch(tx.buchungsdatum)
    const searchDateShort = searchDate.slice(0, 6)
    console.log("[PDF] Searching for tx:", tx.id, "date:", searchDate)

    const textLayers = containerRef.current.querySelectorAll(".react-pdf__Page__textContent")
    if (textLayers.length === 0) return false

    clearHighlights()

    // Collect all date-matching items across all pages
    type Candidate = { item: HTMLElement; pageEl: HTMLElement; textLayer: Element }
    const candidates: Candidate[] = []

    for (const textLayer of Array.from(textLayers)) {
      const pageEl = textLayer.closest(".react-pdf__Page") as HTMLElement | null
      if (!pageEl) continue

      const pageText = textLayer.textContent || ""
      if (!pageText.includes(searchDate) && !pageText.includes(searchDateShort)) continue

      const items = Array.from(textLayer.querySelectorAll('[role="presentation"]')) as HTMLElement[]
      for (const item of items) {
        if (item.textContent?.includes(searchDate) || item.textContent?.includes(searchDateShort)) {
          candidates.push({ item, pageEl, textLayer })
        }
      }
    }

    if (candidates.length === 0) {
      console.warn("[PDF] No date matches found")
      return false
    }

    // Score candidates by description and amount
    const descTokens = (tx.beschreibung ?? "")
      .split(" ")
      .filter(t => t.length >= 3)
      .slice(0, 2)
    const amountStr = formatEuro(Math.abs(tx.betrag_cents))
    console.log("[PDF] Scoring with desc tokens:", descTokens, "amount:", amountStr)

    let best = candidates[0]
    let bestScore = -1

    for (const candidate of candidates) {
      const rowItems = getRowItems(
        Array.from(candidate.textLayer.querySelectorAll('[role="presentation"]')) as HTMLElement[],
        candidate.item
      )
      const rowText = rowItems.map(el => el.textContent ?? "").join(" ")
      let score = 0

      if (descTokens.some(token => rowText.includes(token))) score += 2
      if (rowText.includes(amountStr)) score += 1

      console.log("[PDF] Candidate score:", score, "rowText:", rowText.substring(0, 100))

      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }

    // Highlight the full row
    const rowItems = getRowItems(
      Array.from(best.textLayer.querySelectorAll('[role="presentation"]')) as HTMLElement[],
      best.item
    )
    const pageRect = best.pageEl.getBoundingClientRect()
    const rects = rowItems.map(el => el.getBoundingClientRect())

    if (rects.some(r => r.width === 0 && r.height === 0)) {
      console.warn("[PDF] Row items not ready yet")
      return false
    }

    const rowTop = Math.min(...rects.map(r => r.top))
    const rowBottom = Math.max(...rects.map(r => r.bottom))
    const rowLeft = Math.min(...rects.map(r => r.left))
    const rowRight = Math.max(...rects.map(r => r.right))

    const highlight = document.createElement("div")
    highlight.className = "tx-highlight"
    highlight.style.cssText = `
      position: absolute;
      left: ${rowLeft - pageRect.left}px;
      top: ${rowTop - pageRect.top}px;
      width: ${rowRight - rowLeft}px;
      height: ${rowBottom - rowTop}px;
      background-color: rgba(255, 255, 0, 0.4);
      border-radius: 2px;
      pointer-events: none;
      z-index: 10;
    `
    best.pageEl.appendChild(highlight)
    console.log("[PDF] Full-row highlight placed, score:", bestScore)

    // Scroll to center the row
    const containerRect = containerRef.current.getBoundingClientRect()
    const targetTop = rowTop - containerRect.top + containerRef.current.scrollTop - containerRef.current.clientHeight / 2
    containerRef.current.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })

    return true
  }, [clearHighlights])

  const scheduleSearch = useCallback((tx: Transaction, attempt = 0) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    const delays = [200, 500, 1000, 2000, 3500]
    if (attempt >= delays.length) {
      console.warn("[PDF] Max retries reached, giving up")
      return
    }
    console.log(`[PDF] Scheduling search attempt ${attempt + 1} in ${delays[attempt]}ms`)
    retryTimerRef.current = setTimeout(() => {
      const found = trySearchAndHighlight(tx)
      if (!found) scheduleSearch(tx, attempt + 1)
    }, delays[attempt])
  }, [trySearchAndHighlight])

  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)

    console.log("[PDF] Effect triggered: loading=", loading, "highlightTx=", highlightTx?.id ?? null)

    if (!loading && highlightTx) {
      scheduleSearch(highlightTx)
    } else if (!highlightTx) {
      clearHighlights()
    }

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [loading, highlightTx, scheduleSearch, clearHighlights])

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log("[PDF] Document loaded, pages:", numPages)
    setNumPages(numPages)
    setLoading(false)
    setError(null)
  }

  const onDocumentLoadError = (error: Error) => {
    setLoading(false)
    setError("Fehler beim Laden des PDFs. Bitte versuchen Sie es später erneut.")
    console.error("[PDF] Load error:", error)
  }

  return (
    <div className="w-full border border-gray-200 rounded-lg overflow-hidden bg-white">
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

      {loading && (
        <div className="flex items-center justify-center h-[600px] bg-gray-50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <p className="text-sm text-gray-600">PDF wird geladen...</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {!error && (
        <div
          ref={containerRef}
          className="overflow-auto bg-gray-100"
          style={{ height: "600px", position: "relative" }}
        >
          <Document
            file={`/api/konto/statements/${periode}/pdf`}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-blue-600" size={24} />
              </div>
            }
          >
            {numPages &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div key={`page-${pageNum}`} className="mb-2 shadow-sm">
                  <Page
                    pageNumber={pageNum}
                    width={containerRef.current?.clientWidth ? containerRef.current.clientWidth - 20 : 500}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                  />
                </div>
              ))}
          </Document>
        </div>
      )}
    </div>
  )
}
