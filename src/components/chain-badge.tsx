import { Badge } from "@/components/ui/badge"
import { CHAIN_BADGES } from "@/lib/chain"

export function ChainBadge({ chain, className }: { chain?: string | null; className?: string }) {
  if (!chain) return null
  const entry = CHAIN_BADGES[chain]
  if (!entry) return null
  return <img src={entry.src} alt={entry.label} className={className ?? "h-5 w-auto object-contain"} />
}

export function PaymentBadge({ method }: { method?: string | null }) {
  if (!method) return null
  const m = method.toLowerCase()
  if (m.includes("mastercard") || m.includes("kartenzahlung") || m.includes("karte")) {
    return <img src="/badges/mastercard.png" alt="Mastercard" className="h-5 w-auto object-contain" />
  }
  if (m.includes("visa")) {
    return <img src="/badges/visa.png" alt="Visa" className="h-5 w-auto object-contain" />
  }
  if (m.includes("bar") || m.includes("bargeld")) {
    return <img src="/badges/bar.png" alt="Barzahlung" className="h-5 w-auto object-contain" />
  }
  if (m === "überweisung") {
    return (
      <Badge variant="secondary" className="font-normal text-xs text-purple-700 bg-purple-50 border-purple-200">
        Überweisung
      </Badge>
    )
  }
  if (m === "gutschrift") {
    return (
      <Badge variant="secondary" className="font-normal text-xs text-green-700 bg-green-50 border-green-200">
        Gutschrift
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="font-normal text-xs">
      {method}
    </Badge>
  )
}
