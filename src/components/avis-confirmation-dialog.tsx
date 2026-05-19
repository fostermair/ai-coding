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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react"

interface MatchResult {
  avisName: string
  avisQty: number
  avisPrice: number
  ebonRawName: string
  ebonQty: number
  ebonPrice: number
  ebonDate: string
  confidence: number
}

interface AvisConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matches: MatchResult[]
  unmatched: Array<{ name: string; price: number; date: string }>
  onConfirm: (confirmed: string[], rejected: string[]) => void
  isLoading?: boolean
}

export function AvisConfirmationDialog({
  open,
  onOpenChange,
  matches,
  unmatched,
  onConfirm,
  isLoading = false,
}: AvisConfirmationDialogProps) {
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  const toggleMatch = useCallback((key: string) => {
    setConfirmed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        setRejected((r) => {
          const rNext = new Set(r)
          rNext.delete(key)
          return rNext
        })
      }
      return next
    })
  }, [])

  const toggleReject = useCallback((key: string) => {
    setRejected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        setConfirmed((c) => {
          const cNext = new Set(c)
          cNext.delete(key)
          return cNext
        })
      }
      return next
    })
  }, [])

  const handleConfirmAll = useCallback(() => {
    const allKeys = matches.map((_, i) => `match-${i}`)
    setConfirmed(new Set(allKeys))
    setRejected(new Set())
  }, [matches])

  const handleRejectAll = useCallback(() => {
    const allKeys = matches.map((_, i) => `match-${i}`)
    setRejected(new Set(allKeys))
    setConfirmed(new Set())
  }, [matches])

  const handleSubmit = useCallback(() => {
    onConfirm(Array.from(confirmed), Array.from(rejected))
    setConfirmed(new Set())
    setRejected(new Set())
    onOpenChange(false)
  }, [confirmed, rejected, onConfirm, onOpenChange])

  const getMatchKey = (index: number) => `match-${index}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Überprüfe unsichere Zuordnungen</DialogTitle>
          <DialogDescription>
            Diese Artikel haben eine Konfidenz unter 80%. Bitte überprüfe sie:
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {matches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Keine unsicheren Zuordnungen gefunden.</p>
            </div>
          ) : (
            <>
              {matches.map((match, index) => {
                const key = getMatchKey(index)
                const isConfirmed = confirmed.has(key)
                const isRejected = rejected.has(key)

                return (
                  <Card
                    key={index}
                    className={`border-l-4 transition-all ${
                      isConfirmed
                        ? "border-l-green-500 bg-green-50"
                        : isRejected
                          ? "border-l-red-500 bg-red-50"
                          : "border-l-amber-500 bg-amber-50"
                    }`}
                  >
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        {/* Header with confidence */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <HelpCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                              <p className="text-sm font-medium text-gray-900">
                                Konfidenz: {match.confidence}%
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className={`flex-shrink-0 ${
                              match.confidence >= 70
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            {match.confidence}%
                          </Badge>
                        </div>

                        <Separator />

                        {/* Match details */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                              AVIS (bestellt)
                            </p>
                            <p className="text-sm font-medium text-gray-900">
                              {match.avisName}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {match.avisQty} · {(match.avisPrice / 100).toFixed(2)} €
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                              eBon
                            </p>
                            <p className="text-sm font-medium text-gray-900">
                              {match.ebonRawName}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              {match.ebonQty} · {(match.ebonPrice / 100).toFixed(2)} € ·{" "}
                              {match.ebonDate}
                            </p>
                          </div>
                        </div>

                        <Separator />

                        {/* Actions */}
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant={isRejected ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleReject(key)}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Ablehnen
                          </Button>
                          <Button
                            variant={isConfirmed ? "default" : "outline"}
                            size="sm"
                            className={isConfirmed ? "bg-green-600 hover:bg-green-700" : ""}
                            onClick={() => toggleMatch(key)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Akzeptieren
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </>
          )}

          {/* Unmatched items section */}
          {unmatched.length > 0 && (
            <div className="pt-2">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Nicht zugeordnet ({unmatched.length})
              </h4>
              <div className="space-y-2">
                {unmatched.map((item, i) => (
                  <Card key={i} className="border-gray-200 bg-gray-50">
                    <CardContent className="pt-3 pb-3 px-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {(item.price / 100).toFixed(2)} € · {item.date}
                          </p>
                        </div>
                        <Badge variant="secondary" className="bg-gray-200 text-gray-700 flex-shrink-0">
                          Keine Übereinstimmung
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator className="mt-4" />

        <DialogFooter className="flex gap-2 justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRejectAll}
              disabled={matches.length === 0}
            >
              Alle ablehnen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConfirmAll}
              disabled={matches.length === 0}
            >
              Alle akzeptieren
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || (confirmed.size === 0 && rejected.size === 0 && matches.length > 0)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
