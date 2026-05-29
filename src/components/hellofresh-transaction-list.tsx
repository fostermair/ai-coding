"use client"

import React, { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronRight } from "lucide-react"
import { formatEuro, formatDate } from "@/lib/format"

interface HelloFreshTransaction {
  id: number
  bestellnummer: string
  datum: string
  produkt: string
  portionen: number | null
  personen: number | null
  grundpreis_cents: number
  liefergebuehren_cents: number
  rabatt_cents: number
  hf_cash_cents: number
  gesamt_cents: number
  status: "Bezahlt" | "Erstattet"
  importiert_am: string
}

function fmtEuro(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? "-" : ""
  return `${sign}${formatEuro(abs)} €`
}

export function HelloFreshTransactionList() {
  const [transactions, setTransactions] = useState<HelloFreshTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/hellofresh/transactions")
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden")
        return res.json()
      })
      .then((data) => setTransactions(data.transactions ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const byYear = useMemo(() => {
    const map = new Map<string, HelloFreshTransaction[]>()
    for (const tx of transactions) {
      const year = tx.datum.slice(0, 4)
      if (!map.has(year)) map.set(year, [])
      map.get(year)!.push(tx)
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, txs]) => ({ year, txs }))
  }, [transactions])

  // Auto-expand the most recent year on first load
  useEffect(() => {
    if (byYear.length > 0 && expandedYears.size === 0) {
      setExpandedYears(new Set([byYear[0].year]))
    }
  }, [byYear.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleYear = (year: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <p className="text-gray-500 font-medium">Keine HelloFresh-Daten importiert</p>
        <p className="text-sm text-gray-400 mt-1">
          Gehe zur{" "}
          <Link href="/import" className="text-blue-500 hover:underline">
            Import-Seite
          </Link>{" "}
          und importiere den Zahlungsverlauf unter dem Tab „HelloFresh".
        </p>
      </div>
    )
  }

  const boxOrders = transactions.filter((t) => t.portionen !== null)
  const totalCents = transactions.reduce((s, t) => s + t.gesamt_cents, 0)
  const avgCents =
    boxOrders.length > 0
      ? Math.round(boxOrders.reduce((s, t) => s + t.gesamt_cents, 0) / boxOrders.length)
      : 0

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 mb-0.5">Bestellungen</p>
            <p className="text-2xl font-semibold text-gray-900">{transactions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 mb-0.5">Gesamtausgaben</p>
            <p className="text-2xl font-semibold text-gray-900">{fmtEuro(totalCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 mb-0.5">Ø pro Box-Lieferung</p>
            <p className="text-2xl font-semibold text-gray-900">
              {boxOrders.length > 0 ? fmtEuro(avgCents) : "–"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table with year accordion */}
      <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Datum</TableHead>
              <TableHead>Produkt</TableHead>
              <TableHead className="text-right">Port.</TableHead>
              <TableHead className="text-right">Pers.</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Grundpreis</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Rabatt</TableHead>
              <TableHead className="text-right hidden md:table-cell">HF Cash</TableHead>
              <TableHead className="text-right">Gesamt</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byYear.map(({ year, txs }) => {
              const isExpanded = expandedYears.has(year)
              const yearTotal = txs.reduce((s, t) => s + t.gesamt_cents, 0)
              const yearCount = txs.length

              return (
                <React.Fragment key={`group-${year}`}>
                  {/* Year group header */}
                  <TableRow
                    className="bg-gray-50 hover:bg-gray-100 cursor-pointer select-none border-t border-gray-200"
                    onClick={() => toggleYear(year)}
                  >
                    <TableCell colSpan={9}>
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-150 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="font-medium text-sm text-gray-800">{year}</span>
                        <span className="text-xs text-gray-400">{yearCount} Bestellungen</span>
                        <span className="text-sm font-medium tabular-nums shrink-0 ml-auto text-right w-24">
                          {fmtEuro(yearTotal)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Year rows */}
                  {isExpanded &&
                    txs.map((tx) => {
                      const isErstattet = tx.status === "Erstattet"
                      return (
                        <TableRow
                          key={tx.id}
                          className={isErstattet ? "opacity-60 bg-gray-50" : ""}
                        >
                          <TableCell className="tabular-nums text-sm whitespace-nowrap">
                            {formatDate(tx.datum)}
                          </TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate">
                            {tx.produkt}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {tx.portionen ?? "–"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {tx.personen ?? "–"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums hidden sm:table-cell">
                            {fmtEuro(tx.grundpreis_cents)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums hidden sm:table-cell text-red-600">
                            {tx.rabatt_cents !== 0 ? fmtEuro(tx.rabatt_cents) : "–"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums hidden md:table-cell text-red-600">
                            {tx.hf_cash_cents !== 0 ? fmtEuro(tx.hf_cash_cents) : "–"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums font-medium">
                            {fmtEuro(tx.gesamt_cents)}
                          </TableCell>
                          <TableCell>
                            {isErstattet ? (
                              <Badge
                                variant="outline"
                                className="text-xs font-normal bg-gray-100 text-gray-500 border-gray-200"
                              >
                                Erstattet
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs font-normal bg-green-50 text-green-700 border-green-200"
                              >
                                Bezahlt
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
