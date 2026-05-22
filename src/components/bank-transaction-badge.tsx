"use client"

import { Badge } from "@/components/ui/badge"
import { formatEuro, formatDate } from "@/lib/format"

interface BankTransactionBadgeProps {
  betrag_cents: number
  buchungsdatum: string
  match_source: 'auto' | 'manual'
  logo_path?: string | null
}

export function BankTransactionBadge({ betrag_cents, buchungsdatum, match_source, logo_path }: BankTransactionBadgeProps) {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
      {logo_path ? (
        <img src={logo_path} alt="Händler-Logo" className="h-5 w-auto object-contain flex-shrink-0" />
      ) : (
        <img src="/badges/mastercard.png" alt="Mastercard" className="h-5 w-auto object-contain flex-shrink-0" />
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
  )
}
