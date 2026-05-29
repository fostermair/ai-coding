"use client"

import { useState, useEffect } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/format"

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

interface MultiStoreResponse {
  items: MultiStoreItem[]
  only_one_chain: boolean
  dominant_chain?: string
}

interface MultiStoreTabProps {
  onProductClick: (alias: string) => void
}

export function MultiStoreTab({ onProductClick }: MultiStoreTabProps) {
  const [data, setData] = useState<MultiStoreResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/statistiken/multi-store")
        if (!res.ok) {
          setData({ items: [], only_one_chain: false })
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setData({ items: [], only_one_chain: false })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    )
  }

  if (data?.only_one_chain) {
    const chainLabel = data.dominant_chain
      ? (CHAIN_LABELS[data.dominant_chain] ?? data.dominant_chain)
      : "einer Kette"
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-700 font-medium mb-1">Kein Multi-Store-Vergleich möglich</p>
        <p className="text-gray-500 text-sm">
          Bislang wurden nur {chainLabel}-Bons importiert. Importiere Bons weiterer Supermärkte,
          um Preise vergleichen zu können.
        </p>
      </div>
    )
  }

  if (!data?.items.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-700 font-medium mb-1">Keine Vergleichsdaten vorhanden</p>
        <p className="text-gray-500 text-sm">
          Es wurden keine Produkte gefunden, die in den letzten 6 Monaten in mehreren Supermärkten
          gekauft wurden. Stelle sicher, dass gleiche Produkte denselben Alias haben.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {data.items.length} Produkt{data.items.length !== 1 ? "e" : ""} in mehreren Supermärkten
        gekauft — sortiert nach höchster Preisdifferenz. Klicke auf ein Produkt für Details.
      </p>
      <div className="rounded-lg border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-medium text-gray-500">Produkt</TableHead>
              <TableHead className="text-xs font-medium text-gray-500">Günstigste Kette</TableHead>
              <TableHead className="text-xs font-medium text-gray-500">Teuerste Kette</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 text-right">
                Δ Unterschied
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 text-right">
                Letzter Kauf
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const latestPurchase = [...item.chains]
                .map((c) => c.last_purchase_date)
                .sort()
                .reverse()[0]

              return (
                <TableRow
                  key={item.alias}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => onProductClick(item.alias)}
                >
                  <TableCell className="font-medium text-sm text-gray-900">{item.alias}</TableCell>
                  <TableCell className="text-sm text-green-700 font-medium">
                    {CHAIN_LABELS[item.cheapest_chain] ?? item.cheapest_chain}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {CHAIN_LABELS[item.priciest_chain] ?? item.priciest_chain}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-semibold text-red-600">
                      +{item.delta_pct.toFixed(1).replace(".", ",")}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm text-gray-500">
                    {formatDate(latestPurchase)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
