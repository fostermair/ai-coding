"use client"

import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, ExternalLink } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js"
}

interface PdfViewerProps {
  src: string
  highlight?: string
  defaultZoom?: number
  toolbar?: boolean
  className?: string
}

function getRowItems(items: HTMLElement[], anchor: HTMLElement): HTMLElement[] {
  const anchorTop = anchor.getBoundingClientRect().top
  return items.filter(item => Math.abs(item.getBoundingClientRect().top - anchorTop) <= 3)
}

export function PdfViewer({ src, highlight, defaultZoom = 1.0, toolbar = true, className = "" }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(defaultZoom)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHighlights = useCallback(() => {
    containerRef.current?.querySelectorAll(".pdf-highlight").forEach((el) => el.remove())
  }, [])

  const trySearchAndHighlight = useCallback((searchText: string): boolean => {
    if (!containerRef.current || !searchText.trim()) return false

    const textLayers = containerRef.current.querySelectorAll(".react-pdf__Page__textContent")
    if (textLayers.length === 0) return false

    clearHighlights()

    type Candidate = { item: HTMLElement; pageEl: HTMLElement; textLayer: Element }
    const candidates: Candidate[] = []

    for (const textLayer of Array.from(textLayers)) {
      const pageEl = textLayer.closest(".react-pdf__Page") as HTMLElement | null
      if (!pageEl) continue

      const pageText = textLayer.textContent || ""
      if (!pageText.includes(searchText)) continue

      const items = Array.from(textLayer.querySelectorAll('[role="presentation"]')) as HTMLElement[]
      for (const item of items) {
        if (item.textContent?.includes(searchText)) {
          candidates.push({ item, pageEl, textLayer })
        }
      }
    }

    if (candidates.length === 0) {
      return false
    }

    const best = candidates[0]
    const rowItems = getRowItems(
      Array.from(best.textLayer.querySelectorAll('[role="presentation"]')) as HTMLElement[],
      best.item
    )
    const pageRect = best.pageEl.getBoundingClientRect()
    const rects = rowItems.map(el => el.getBoundingClientRect())

    if (rects.some(r => r.width === 0 && r.height === 0)) {
      return false
    }

    const rowTop = Math.min(...rects.map(r => r.top))
    const rowBottom = Math.max(...rects.map(r => r.bottom))
    const rowLeft = Math.min(...rects.map(r => r.left))
    const rowRight = Math.max(...rects.map(r => r.right))

    const highlightDiv = document.createElement("div")
    highlightDiv.className = "pdf-highlight"
    highlightDiv.style.cssText = `
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
    best.pageEl.appendChild(highlightDiv)

    const containerRect = containerRef.current.getBoundingClientRect()
    const targetTop = rowTop - containerRect.top + containerRef.current.scrollTop - containerRef.current.clientHeight / 2
    containerRef.current.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })

    return true
  }, [clearHighlights])

  const scheduleSearch = useCallback((searchText: string, attempt = 0) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    const delays = [200, 500, 1000, 2000, 3500]
    if (attempt >= delays.length) return

    retryTimerRef.current = setTimeout(() => {
      const found = trySearchAndHighlight(searchText)
      if (!found) scheduleSearch(searchText, attempt + 1)
    }, delays[attempt])
  }, [trySearchAndHighlight])

  useEffect(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)

    if (!loading && highlight?.trim()) {
      scheduleSearch(highlight)
    } else if (!highlight) {
      clearHighlights()
    }

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [loading, highlight, scheduleSearch, clearHighlights])

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
  }

  const onDocumentLoadError = () => {
    setLoading(false)
    setError("PDF konnte nicht geladen werden. Bitte versuchen Sie es später erneut.")
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(src)
      if (!response.ok) throw new Error("Download failed")

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `document.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e) {
      alert("Download fehlgeschlagen")
    }
  }

  const handleOpenExternal = () => {
    window.open(src, "_blank")
  }

  const canGoPrev = pageNumber > 1
  const canGoNext = numPages && pageNumber < numPages

  return (
    <div className={`flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
            disabled={!canGoPrev}
            title="Vorherige Seite"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="text-sm text-gray-600 whitespace-nowrap">
            {numPages ? `${pageNumber} / ${numPages}` : "Seiten werden geladen..."}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPageNumber(Math.min(numPages || pageNumber, pageNumber + 1))}
            disabled={!canGoNext}
            title="Nächste Seite"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
            title="Verkleinern"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <span className="text-xs text-gray-600 w-12 text-center">{Math.round(scale * 100)}%</span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScale(Math.min(3, scale + 0.25))}
            title="Vergrößern"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          {toolbar && (
            <>
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                title="Herunterladen"
              >
                <Download className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenExternal}
                title="Im neuen Fenster öffnen"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center flex-1 bg-gray-50">
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
          className="overflow-auto flex-1 bg-gray-100"
          style={{ position: "relative" }}
        >
          <Document
            file={src}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-blue-600" size={24} />
              </div>
            }
          >
            {numPages &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((num) => (
                <div key={`page-${num}`} className="mb-2 shadow-sm flex justify-center">
                  <Page
                    pageNumber={num}
                    scale={scale}
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

export default PdfViewer
