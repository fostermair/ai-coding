"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { formatEuro, formatDate } from "@/lib/format"

const CHAIN_LABELS: Record<string, string> = {
  rewe: "REWE",
  lidl: "Lidl",
  kaufland: "Kaufland",
  edeka: "EDEKA",
  sonstige: "Sonstige",
}

interface MultiStoreChain {
  chain: string
  avg_price_cents: number
  normalized_unit: string | null
  last_purchase_date: string
  is_stale: boolean
  is_normalized: boolean
}

interface MultiStoreItem {
  alias: string
  chains: MultiStoreChain[]
  cheapest_chain: string
  priciest_chain: string
  delta_pct: number
}

interface MultiStoreProductSectionProps {
  productName: string | null
}

export function MultiStoreProductSection({ productName }: MultiStoreProductSectionProps) {
  const [item, setItem] = useState<MultiStoreItem | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async (name: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/produkte/${encodeURIComponent(name)}/multi-store`)
      if (!res.ok) {
        setItem(null)
        return
      }
      const json = await res.json()
      setItem(json.item)
    } catch {
      setItem(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (productName) {
      fetchData(productName)
    } else {
      setItem(null)
    }
  }, [productName, fetchData])

  if (!productName) return null

  if (loading) {
    return (
      <div className="space-y-2 pt-2 border-t border-gray-100">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (!item) return null

  const sorted = [...item.chains].sort((a, b) => a.avg_price_cents - b.avg_price_cents)
  const cheapestPrice = sorted[0].avg_price_cents

  return (
    <div className="space-y-3 pt-2 border-t border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700">Preisvergleich nach Supermarkt</h3>
      <div className="rounded-lg border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-medium text-gray-500">Kette</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 text-right">Ø Preis</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 text-right">Letzter Kauf</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 text-right">vs. günstigste</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((chain) => {
              const isCheapest = chain.chain === item.cheapest_chain
              const deltaPct =
                isCheapest || cheapestPrice === 0
                  ? 0
                  : Math.round(
                      ((chain.avg_price_cents - cheapestPrice) / cheapestPrice) * 1000
                    ) / 10

              return (
                <TableRow key={chain.chain} className={isCheapest ? "bg-green-50" : ""}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={
                          isCheapest
                            ? "text-green-700"
                            : chain.is_stale
                            ? "text-gray-400"
                            : "text-gray-900"
                        }
                      >
                        {CHAIN_LABELS[chain.chain] ?? chain.chain}
                      </span>
                      {chain.is_stale && (
                        <Badge
                          variant="outline"
                          className="text-xs py-0 px-1.5 h-5 text-gray-400 border-gray-200"
                        >
                          veraltet
                        </Badge>
                      )}
                      {isCheapest && (
                        <Badge className="text-xs py-0 px-1.5 h-5 bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                          günstigste
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={chain.is_stale ? "text-gray-400" : ""}>
                      {formatEuro(chain.avg_price_cents)} €
                    </span>
                    {chain.normalized_unit && (
                      <span className="text-xs text-gray-400 ml-1">/ {chain.normalized_unit}</span>
                    )}
                    {!chain.is_normalized && (
                      <span className="text-xs text-gray-400 ml-1">(Stückpreis)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {formatDate(chain.last_purchase_date)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isCheapest ? (
                      <span className="text-green-600 font-medium">—</span>
                    ) : (
                      <span className="text-red-600 font-medium">
                        +{deltaPct.toFixed(1).replace(".", ",")}%
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400">
        Gleiche Produkte aus verschiedenen Ketten müssen denselben Alias haben, um verglichen zu werden.
      </p>
    </div>
  )
}
