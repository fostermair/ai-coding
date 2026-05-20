"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Search, Zap } from "lucide-react"

interface Candidate {
  id: number
  avis_item_name: string
  avis_unit_price_cents: number
  confidence: number
  status: string
  import_log_id: number
  receipt_item_id: number | null
  assigned_to_raw_name?: string | null
}

interface Suggestion {
  avis_item_name: string
  score: number
}

interface AvisManualAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receiptId: number
  receiptItemId: number
  rawName: string
  onAssign: (avisItemName: string, matchSource: "avis_document" | "global_database") => Promise<void>
  isLoading?: boolean
}

export function AvisManualAssignDialog({
  open,
  onOpenChange,
  receiptId,
  receiptItemId,
  rawName,
  onAssign,
  isLoading = false,
}: AvisManualAssignDialogProps) {
  const [searchText, setSearchText] = useState("")
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [loadingSuggestion, setLoadingSuggestion] = useState(false)

  // Global search states
  const [globalSearchText, setGlobalSearchText] = useState(rawName)
  const [globalResults, setGlobalResults] = useState<Suggestion[]>([])
  const [loadingGlobal, setLoadingGlobal] = useState(false)
  const [selectedGlobal, setSelectedGlobal] = useState<Suggestion | null>(null)
  const [globalDebounceTimer, setGlobalDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  // Load candidates and initial global suggestions when dialog opens
  useEffect(() => {
    if (!open) return

    const loadData = async () => {
      setLoadingCandidates(true)
      setLoadingGlobal(true)
      setError(null)

      try {
        // Load candidates from same AVIS
        const candRes = await fetch(`/api/avis/matches/candidates?receipt_id=${receiptId}`)
        if (candRes.ok) {
          const data = await candRes.json()
          setCandidates(data.candidates || [])
        } else {
          setError("Fehler beim Laden der Kandidaten")
        }
      } catch (e) {
        console.error("Failed to load candidates:", e)
        setError("Fehler beim Laden der Kandidaten")
      } finally {
        setLoadingCandidates(false)
      }

      try {
        // Load initial global suggestions (top 10 fuzzy matches)
        const globalRes = await fetch(
          `/api/avis/suggestions?raw_name=${encodeURIComponent(rawName)}&limit=10`
        )
        if (globalRes.ok) {
          const data = await globalRes.json()
          setGlobalResults(data.suggestions || [])
          // Also set singular suggestion for backward compatibility if exists
          if (data.suggestions?.length > 0) {
            setSuggestion(data.suggestions[0])
          }
        }
      } catch (e) {
        console.error("Failed to load global suggestions:", e)
      } finally {
        setLoadingGlobal(false)
      }
    }

    loadData()
  }, [open, receiptId, rawName])

  // Debounced global search
  useEffect(() => {
    if (!open) return

    // Clear existing timer
    if (globalDebounceTimer) {
      clearTimeout(globalDebounceTimer)
    }

    // Set up new timer
    const timer = setTimeout(async () => {
      if (!globalSearchText.trim()) return

      setLoadingGlobal(true)
      try {
        const globalRes = await fetch(
          `/api/avis/suggestions?raw_name=${encodeURIComponent(rawName)}&search=${encodeURIComponent(globalSearchText)}&limit=20`
        )
        if (globalRes.ok) {
          const data = await globalRes.json()
          setGlobalResults(data.suggestions || [])
        }
      } catch (e) {
        console.error("Failed to search global suggestions:", e)
      } finally {
        setLoadingGlobal(false)
      }
    }, 300) // 300ms debounce

    setGlobalDebounceTimer(timer)

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [globalSearchText, open, rawName])

  // Filter candidates by search text
  const filteredCandidates = candidates.filter((c) =>
    c.avis_item_name.toLowerCase().includes(searchText.toLowerCase())
  )

  const handleSelectCandidate = (candidate: Candidate) => {
    setSelectedCandidate(candidate)
    setSelectedGlobal(null)
  }

  const handleSelectGlobal = (result: Suggestion) => {
    setSelectedGlobal(result)
    setSelectedCandidate(null)
  }

  const handleAssign = async () => {
    if (selectedCandidate) {
      setAssigning(true)
      try {
        await onAssign(selectedCandidate.avis_item_name, "avis_document")
        onOpenChange(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler beim Zuweisen")
      } finally {
        setAssigning(false)
      }
    } else if (selectedGlobal) {
      setAssigning(true)
      try {
        await onAssign(selectedGlobal.avis_item_name, "global_database")
        onOpenChange(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler beim Zuweisen")
      } finally {
        setAssigning(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>AVIS-Name manuell zuweisen</DialogTitle>
          <DialogDescription>
            Artikel: <span className="font-medium text-gray-900">{rawName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Candidates from same AVIS */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Aus dieser AVIS ({candidates.length} Positionen)
            </h3>

            {loadingCandidates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : candidates.length > 0 ? (
              <>
                {/* Search input */}
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Suche filtern..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>

                {/* Candidates list */}
                <ScrollArea className="h-40 border rounded-lg bg-white">
                  <div className="space-y-1 p-3">
                    {filteredCandidates.length > 0 ? (
                      filteredCandidates.map((candidate) => (
                        <div
                          key={candidate.id}
                          onClick={() => handleSelectCandidate(candidate)}
                          className={`p-2 rounded cursor-pointer transition-colors ${
                            selectedCandidate?.id === candidate.id
                              ? "bg-blue-100 border border-blue-300"
                              : "hover:bg-gray-50 border border-transparent"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {candidate.avis_item_name}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {(candidate.avis_unit_price_cents / 100).toFixed(2)} € •{" "}
                                {candidate.status}
                              </p>
                            </div>
                            {candidate.receipt_item_id && (
                              <Badge variant="secondary" className="text-xs flex-shrink-0">
                                bereits zugeordnet
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-sm text-gray-500">
                        Keine Kandidaten gefunden
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="text-center py-6 text-sm text-gray-500">
                Keine AVIS-Positionen für diesen Bon
              </div>
            )}
          </div>

          <Separator />

          {/* Global database search */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Suche in Gesamtdatenbank
            </h3>

            {/* Search input */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Namen suchen..."
                value={globalSearchText}
                onChange={(e) => {
                  setGlobalSearchText(e.target.value)
                  setSelectedGlobal(null)
                }}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Global results list */}
            {loadingGlobal ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : globalResults.length > 0 ? (
              <ScrollArea className="h-40 border rounded-lg bg-white">
                <div className="space-y-1 p-3">
                  {globalResults.map((result, index) => (
                    <div
                      key={result.avis_item_name}
                      onClick={() => handleSelectGlobal(result)}
                      className={`p-2 rounded cursor-pointer transition-colors ${
                        selectedGlobal?.avis_item_name === result.avis_item_name &&
                        selectedGlobal?.score === result.score
                          ? "bg-blue-100 border border-blue-300"
                          : "hover:bg-gray-50 border border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            {index === 0 && (
                              <Zap className="h-3 w-3 text-blue-600 flex-shrink-0" />
                            )}
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {result.avis_item_name}
                            </p>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {result.score}% Ähnlichkeit
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-6 text-sm text-gray-500">
                Kein Treffer
              </div>
            )}
          </div>
        </div>

        <Separator className="mt-2" />

        <DialogFooter className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assigning || isLoading}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleAssign}
            disabled={(!selectedCandidate && !selectedGlobal) || assigning || isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {assigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Zuweisen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
