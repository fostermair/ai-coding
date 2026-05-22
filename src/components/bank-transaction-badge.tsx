"use client"

import { CreditCard } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatEuro, formatDate } from "@/lib/format"

interface BankTransactionBadgeProps {
  betrag_cents: number
  buchungsdatum: string
  match_source: 'auto' | 'manual'
  logo_path?: string | null
  alias?: string | null
  beschreibung?: string | null
}

export function BankTransactionBadge({ betrag_cents, buchungsdatum, match_source, logo_path, alias, beschreibung }: BankTransactionBadgeProps) {
  const displayName = alias || beschreibung
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
      {logo_path ? (
        <img src={logo_path} alt="Händler-Logo" className="h-5 w-auto object-contain flex-shrink-0" />
      ) : (
        <CreditCard className="h-4 w-4 text-gray-400 flex-shrink-0" aria-label="Bankzahlung" />
      )}
      <div className="flex flex-col gap-0.5">
        {displayName && <span className="text-sm font-medium text-gray-800">{displayName}</span>}
        {alias && beschreibung && beschreibung !== alias && (
          <span className="text-xs text-gray-400">{beschreibung}</span>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-700">
            Kontoabbuchung: <span className="font-medium tabular-nums">-{formatEuro(Math.abs(betrag_cents))} €</span>
            <span className="text-gray-500 ml-1">({formatDate(buchungsdatum)})</span>
          </span>
          {match_source === 'manual' && (
            <Badge variant="outline" className="text-xs font-normal bg-purple-50 border-purple-200 text-purple-700">
              Manuell
            </Badge>
          )}
          {match_source === 'auto' && (
            <Badge variant="outline" className="text-xs font-normal bg-blue-50 border-blue-200 text-blue-700">
              Auto
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
