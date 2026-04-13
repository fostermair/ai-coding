"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Package, Search, ArrowUpDown, Check, X, Pencil, Trash2, Upload, TrendingUp } from "lucide-react"
import Link from "next/link"
import { formatEuro, formatDate } from "@/lib/format"
import { PriceChartSheet } from "@/components/price-chart-sheet"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Product {
  raw_name: string
  alias: string | null
  purchase_count: number
  first_price_cents: number | null
  last_price_cents: number
  price_trend_pct: number | null
  trend_from_date: string | null
  trend_to_date: string | null
  last_purchase_date: string
  excluded_from_stats: boolean
}

interface ProdukteResponse {
  products: Product[]
  total_count: number
  excluded_count: number
}

type SortKey = "frequency" | "name" | "last_purchase"
type FilterKey = "all" | "active" | "excluded"

const SORT_LABELS: Record<SortKey, string> = {
  frequency: "Häufigkeit",
  name: "Name A–Z",
  last_purchase: "Letzter Kauf",
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Alle",
  active: "Aktiv",
  excluded: "Ausgeblendet",
}

function formatMonthYear(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString("de-DE", { month: "short", year: "numeric" })
}

function PriceTrendBadge({
  pct,
  fromDate,
  toDate,
  onClick,
}: {
  pct: number | null
  fromDate: string | null
  toDate: string | null
  onClick: () => void
}) {
  if (pct === null) return null

  const isUp = pct > 0
  const isDown = pct < 0
  const arrow = isUp ? "↑" : isDown ? "↓" : "→"
  const formatted = pct === 0 ? "0%" : `${Math.abs(pct).toFixed(1).replace(".", ",")}%`
  const colorClass = isUp
    ? "border-transparent bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer"
    : isDown
    ? "border-transparent bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
    : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer"

  const tooltipText =
    fromDate && toDate
      ? `${formatMonthYear(fromDate)} – ${formatMonthYear(toDate)}`
      : "letzte 12 Monate"

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            className={colorClass}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onClick()}
          >
            {arrow} {formatted}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ProductList() {
  const [data, setData] = useState<ProdukteResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("frequency")
  const [filter, setFilter] = useState<FilterKey>("all")

  // Price chart state
  const [chartOpen, setChartOpen] = useState(false)
  const [chartProduct, setChartProduct] = useState<string | null>(null)

  // Inline-edit state
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Tracks which products are currently toggling (for optimistic updates)
  const [togglingNames, setTogglingNames] = useState<Set<string>>(new Set())

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("q", search.trim())
      params.set("sort", sort)
      if (filter !== "all") params.set("filter", filter)
      const res = await fetch(`/api/produkte?${params.toString()}`)
      if (!res.ok) throw new Error("Fehler beim Laden der Produkte")
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [search, sort, filter])

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 200)
    return () => clearTimeout(timer)
  }, [fetchProducts])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingName && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingName])

  const startEdit = (product: Product) => {
    setEditingName(product.raw_name)
    setEditValue(product.alias ?? "")
  }

  const cancelEdit = () => {
    setEditingName(null)
    setEditValue("")
  }

  const saveAlias = async (rawName: string) => {
    const trimmed = editValue.trim()
    setSaving(true)
    try {
      if (trimmed) {
        const res = await fetch(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alias: trimmed }),
        })
        if (!res.ok) throw new Error("Speichern fehlgeschlagen")
      } else {
        const res = await fetch(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
          method: "DELETE",
        })
        if (!res.ok) throw new Error("Löschen fehlgeschlagen")
      }
      cancelEdit()
      await fetchProducts()
    } catch {
      setError("Alias konnte nicht gespeichert werden")
    } finally {
      setSaving(false)
    }
  }

  const deleteAlias = async (rawName: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/produkte/${encodeURIComponent(rawName)}/alias`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Löschen fehlgeschlagen")
      await fetchProducts()
    } catch {
      setError("Alias konnte nicht gelöscht werden")
    } finally {
      setSaving(false)
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent, rawName: string) => {
    if (e.key === "Enter") {
      e.preventDefault()
      saveAlias(rawName)
    } else if (e.key === "Escape") {
      cancelEdit()
    }
  }

  const toggleExclude = async (product: Product) => {
    const newExcluded = !product.excluded_from_stats

    // Optimistic update
    setTogglingNames((prev) => new Set(prev).add(product.raw_name))
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.raw_name === product.raw_name
            ? { ...p, excluded_from_stats: newExcluded }
            : p
        ),
        excluded_count: newExcluded
          ? prev.excluded_count + 1
          : prev.excluded_count - 1,
      }
    })

    try {
      const res = await fetch(
        `/api/produkte/${encodeURIComponent(product.raw_name)}/exclude`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excluded: newExcluded }),
        }
      )
      if (!res.ok) throw new Error("Speichern fehlgeschlagen")
    } catch {
      // Revert optimistic update on error
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          products: prev.products.map((p) =>
            p.raw_name === product.raw_name
              ? { ...p, excluded_from_stats: !newExcluded }
              : p
          ),
          excluded_count: newExcluded
            ? prev.excluded_count - 1
            : prev.excluded_count + 1,
        }
      })
      setError("Status konnte nicht gespeichert werden")
    } finally {
      setTogglingNames((prev) => {
        const next = new Set(prev)
        next.delete(product.raw_name)
        return next
      })
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchProducts}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  const products = data?.products ?? []
  const totalCount = data?.total_count ?? 0
  const excludedCount = data?.excluded_count ?? 0

  // ── Empty state (no products at all) ──────────────────────────────────────
  if (totalCount === 0 && !search && filter === "all") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <Package className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Noch keine Produkte
        </h2>
        <p className="text-sm text-gray-400 mb-6 max-w-sm">
          Importiere zuerst eBons, um die Produktdatenbank aufzubauen.
        </p>
        <Button asChild>
          <Link href="/import">
            <Upload className="h-4 w-4 mr-1.5" />
            eBons importieren
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-6 rounded-lg border border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
            <p className="text-xs text-gray-500">Produkt{totalCount !== 1 ? "e" : ""}</p>
          </div>
        </div>
        {excludedCount > 0 && (
          <div className="text-sm text-gray-400">
            <span className="font-medium text-amber-600">{excludedCount}</span>{" "}
            ausgeblendet aus Statistiken
          </div>
        )}
      </div>

      {/* Search + Sort + Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Produkt suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-4 w-4 text-gray-400" />
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <Button
              key={key}
              variant={sort === key ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSort(key)}
            >
              {SORT_LABELS[key]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <Button
              key={key}
              variant={filter === key ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilter(key)}
            >
              {FILTER_LABELS[key]}
            </Button>
          ))}
        </div>
      </div>

      {/* Error banner (non-blocking) */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Search empty state */}
      {products.length === 0 && (search || filter !== "all") && (
        <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
          {search ? (
            <>
              <p className="text-gray-500">Kein Produkt für &ldquo;{search}&rdquo; gefunden.</p>
              <Button variant="link" size="sm" onClick={() => setSearch("")} className="mt-2">
                Suche zurücksetzen
              </Button>
            </>
          ) : (
            <>
              <p className="text-gray-500">Keine ausgeblendeten Produkte vorhanden.</p>
              <Button variant="link" size="sm" onClick={() => setFilter("all")} className="mt-2">
                Alle Produkte anzeigen
              </Button>
            </>
          )}
        </div>
      )}

      {/* Product table */}
      {products.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-full">Produkt</TableHead>
                <TableHead className="hidden sm:table-cell">Alias</TableHead>
                <TableHead className="text-right">Käufe</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Letzter Preis</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Preistrend</TableHead>
                <TableHead className="text-right hidden md:table-cell">Letzter Kauf</TableHead>
                <TableHead className="text-center hidden sm:table-cell whitespace-nowrap">
                  Statistiken
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow
                  key={product.raw_name}
                  className={product.excluded_from_stats ? "opacity-50" : undefined}
                >
                  {/* Raw name */}
                  <TableCell className="font-medium font-mono text-xs text-gray-600 max-w-[250px]">
                    <span className={`truncate block${product.excluded_from_stats ? " line-through" : ""}`}>
                      {product.raw_name}
                    </span>
                  </TableCell>

                  {/* Alias (inline-editable) */}
                  <TableCell className="hidden sm:table-cell min-w-[200px]">
                    {editingName === product.raw_name ? (
                      <div className="flex items-center gap-1">
                        <Input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, product.raw_name)}
                          className="h-7 text-sm"
                          placeholder="Alias eingeben…"
                          disabled={saving}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                          onClick={() => saveAlias(product.raw_name)}
                          disabled={saving}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        {product.alias ? (
                          <>
                            <span className="text-sm font-medium text-gray-900">{product.alias}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
                              onClick={() => startEdit(product)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                              onClick={() => deleteAlias(product.raw_name)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <button
                            className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-1"
                            onClick={() => startEdit(product)}
                          >
                            <Pencil className="h-3 w-3" />
                            Alias setzen
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Purchase count */}
                  <TableCell className="text-right tabular-nums">
                    {product.purchase_count}×
                  </TableCell>

                  {/* Last price */}
                  <TableCell className="text-right tabular-nums hidden sm:table-cell">
                    {formatEuro(product.last_price_cents)} €
                  </TableCell>

                  {/* Price trend badge */}
                  <TableCell className="text-right hidden sm:table-cell">
                    <PriceTrendBadge
                      pct={product.price_trend_pct ?? null}
                      fromDate={product.trend_from_date}
                      toDate={product.trend_to_date}
                      onClick={() => {
                        setChartProduct(product.raw_name)
                        setChartOpen(true)
                      }}
                    />
                  </TableCell>

                  {/* Last purchase date */}
                  <TableCell className="text-right text-gray-500 hidden md:table-cell">
                    {formatDate(product.last_purchase_date)}
                  </TableCell>

                  {/* Exclude from stats toggle */}
                  <TableCell className="text-center hidden sm:table-cell">
                    <Switch
                      checked={!product.excluded_from_stats}
                      onCheckedChange={() => toggleExclude(product)}
                      disabled={togglingNames.has(product.raw_name)}
                      aria-label={
                        product.excluded_from_stats
                          ? `${product.raw_name} in Statistiken anzeigen`
                          : `${product.raw_name} aus Statistiken ausblenden`
                      }
                    />
                  </TableCell>

                  {/* Price chart button */}
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                      title="Preisentwicklung anzeigen"
                      onClick={() => {
                        setChartProduct(product.raw_name)
                        setChartOpen(true)
                      }}
                    >
                      <TrendingUp className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Price chart sheet */}
      <PriceChartSheet
        open={chartOpen}
        onOpenChange={setChartOpen}
        initialProduct={chartProduct}
      />
    </div>
  )
}
