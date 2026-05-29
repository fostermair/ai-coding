"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"

interface ImportResult {
  imported: number
  updated: number
  total: number
}

export function HelloFreshImportPanel() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch("/api/hellofresh/import", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Unbekannter Fehler beim Import")
      } else {
        setResult(data)
      }
    } catch {
      setError("Netzwerkfehler — Server nicht erreichbar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        <h2 className="text-base font-medium text-gray-900 mb-1">HelloFresh Zahlungsverlauf</h2>
        <p className="text-sm text-gray-500 mb-4">
          Liest{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono">
            data/hellofresh/hellofresh_zahlungsverlauf.json
          </code>{" "}
          ein und speichert alle Einträge in der Datenbank. Bereits vorhandene Bestellnummern werden aktualisiert (kein Duplikat).
        </p>
        <Button onClick={handleImport} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Importiere …" : "Zahlungsverlauf importieren"}
        </Button>
      </div>

      {result && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Import erfolgreich</p>
            <p>
              {result.imported > 0 && <span>{result.imported} neu importiert</span>}
              {result.imported > 0 && result.updated > 0 && <span> · </span>}
              {result.updated > 0 && <span>{result.updated} aktualisiert</span>}
              {result.total === 0 && <span>Keine Einträge verarbeitet</span>}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-medium">Import fehlgeschlagen</p>
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
