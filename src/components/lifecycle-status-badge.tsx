"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Landmark, FileText, CheckCircle2, Leaf } from "lucide-react"

export type LifecycleStatus = "konto" | "beleg" | "vollstaendig" | "hellofresh"

export interface LifecycleStatusBadgeProps {
  is_virtual?: number
  item_count: number
  avis_status?: "complete" | "pending" | "no_matches" | null
  has_bestellung?: number
  source?: "hellofresh"
}

function deriveStatus(props: LifecycleStatusBadgeProps): LifecycleStatus {
  if (props.source === "hellofresh") return "hellofresh"
  if (props.is_virtual === 1 || props.item_count === 0) return "konto"
  if (props.has_bestellung === 1 || props.avis_status === "complete") return "vollstaendig"
  if (props.item_count > 0) return "beleg"
  return "konto"
}

const STATUS_CONFIG: Record<
  LifecycleStatus,
  { label: string; tooltip: string; className: string; Icon: React.ElementType }
> = {
  konto: {
    label: "Konto",
    tooltip: "Kein eBon importiert — nur Kontoauszug vorhanden",
    className: "bg-gray-50 text-gray-500 border-gray-200",
    Icon: Landmark,
  },
  beleg: {
    label: "Beleg",
    tooltip: "eBon vorhanden, aber noch nicht verifiziert (kein AVIS / keine Bestellung)",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    Icon: FileText,
  },
  vollstaendig: {
    label: "Vollständig",
    tooltip: "eBon vollständig verifiziert — AVIS bestätigt oder Bestellung verknüpft",
    className: "bg-green-50 text-green-700 border-green-200",
    Icon: CheckCircle2,
  },
  hellofresh: {
    label: "HelloFresh",
    tooltip: "HelloFresh-Bestellung",
    className: "bg-green-100 text-green-800 border-green-200",
    Icon: Leaf,
  },
}

export function LifecycleStatusBadge(props: LifecycleStatusBadgeProps) {
  const status = deriveStatus(props)
  const { label, tooltip, className, Icon } = STATUS_CONFIG[status]

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 font-normal text-xs cursor-default ${className}`}>
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
