"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, XCircle } from "lucide-react"

interface AvisStatusBadgeProps {
  status?: "complete" | "pending" | "no_matches" | null
}

export function AvisStatusBadge({ status }: AvisStatusBadgeProps) {
  if (!status) return null

  if (status === "complete") {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-normal text-xs gap-1">
        <CheckCircle className="h-3 w-3" />
        AVIS ✓
      </Badge>
    )
  }

  if (status === "pending") {
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 font-normal text-xs gap-1">
        <AlertCircle className="h-3 w-3" />
        AVIS ⚠
      </Badge>
    )
  }

  if (status === "no_matches") {
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 font-normal text-xs gap-1">
        <XCircle className="h-3 w-3" />
        AVIS ⊗
      </Badge>
    )
  }

  return null
}
