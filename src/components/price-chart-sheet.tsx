"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronsUpDown, Check } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Dot,
} from "recharts"
import { formatEuro, formatDate } from "@/lib/format"

interface PricePoint {
  datum: string
  zeit: string
  einzelpreis_cents: number
  rabatt_cents: number
  bon_nr: string
  markt: string
}

interface PriceData {
  raw_name: string
  alias: string | null
  preise: PricePoint[]
}

interface ProductOption {
  raw_name: string
  alias: string | null
}

interface JahrStat {
  jahr: number
  avg_preis_cents: number
  veraenderung_cents: number | null
  veraenderung_prozent: number | null
  is_partial_year: boolean
}

interface PreisentwicklungData {
  gesamt: {
    erster_kauf: { datum: string; preis_cents: number }
    letzter_kauf: { datum: string; preis_cents: number }
    veraenderung_cents: number
    veraenderung_prozent: number
  }
  jahre: JahrStat[]
  inflation_cagr_pct: number | null
}

interface SeasonMonth {
  monat: number
  avg_preis_cents: number
  kaufanzahl: number
}

interface SeasonData {
  raw_name: string
  seasonal: boolean
  monate: SeasonMonth[]
  warning?: string
}

interface PriceChartSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProduct: string | null
}

function centsToEuro(cents: number): number {
  return cents / 100
}

// Custom dot: blue for normal, orange for discounted
function CustomDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as {
    cx: number
    cy: number
    payload: { rabatt_cents: number }
  }
  const hasDiscount = payload?.rabatt_cents > 0
  return (
    <Dot
      cx={cx}
      cy={cy}
      r={5}
      fill={hasDiscount ? "#f97316" : "#3b82f6"}
      stroke={hasDiscount ? "#ea580c" : "#2563eb"}
      strokeWidth={2}
    />
  )
}

// Custom tooltip
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: PricePoint & { preis: number } }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  const hasDiscount = data.rabatt_cents > 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm space-y-1">
      <p className="font-medium">{formatDate(data.datum)}</p>
      <p>
        Preis: <span className="font-semibold">{formatEuro(data.einzelpreis_cents)} &euro;</span>
      </p>
      {hasDiscount && (
        <>
          <p className="text-orange-600">
            Originalpreis: {formatEuro(data.einzelpreis_cents + data.rabatt_cents)} &euro;
          </p>
          <p className="text-orange-600">
            Rabatt: -{formatEuro(data.rabatt_cents)} &euro;
          </p>
        </>
      )}
      {data.bon_nr && <p className="text-gray-500">Bon: {data.bon_nr}</p>}
      {data.markt && <p className="text-gray-500">Markt: {data.markt}</p>}
    </div>
  )
}

// Season classification function
type SeasonCategory = "günstig" | "normal" | "teuer" | null

function classifySeasons(monate: SeasonMonth[]): Map<number, SeasonCategory> {
  const result = new Map<number, SeasonCategory>()

  if (monate.length === 0) return result

  const monatAvgs = monate.map((m) => m.avg_preis_cents)
  const min = Math.min(...monatAvgs)

  // Calculate median
  const sorted = [...monatAvgs].sort((a, b) => a - b)
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]

  // Classify each month
  // Günstig: avg <= min * 1.1 (within 10% of minimum)
  // Teuer: avg >= median * 1.1 (at least 10% above median)
  // Normal: everything else
  for (const monat of monate) {
    const avg = monat.avg_preis_cents

    if (avg <= min * 1.1) {
      result.set(monat.monat, "günstig")
    } else if (avg >= median * 1.1) {
      result.set(monat.monat, "teuer")
    } else {
      result.set(monat.monat, "normal")
    }
  }

  return result
}

// Inline season calendar component
function SeasonCalendar({
  saisonData,
  isLoading,
}: {
  saisonData: SeasonData | null
  isLoading: boolean
}) {
  if (!saisonData || !saisonData.seasonal || saisonData.monate.length === 0) {
    return null
  }

  const monthNames = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ]

  const classifications = classifySeasons(saisonData.monate)
  const monatByNumber = new Map(saisonData.monate.map((m) => [m.monat, m]))

  const currentMonth = new Date().getMonth() + 1

  return (
    <div className="space-y-4 pt-2 border-t border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700">Saisonmuster</h3>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* 12-month calendar grid */}
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const monthData = monatByNumber.get(month)
              const category = classifications.get(month)
              const isCurrentMonth = month === currentMonth

              const bgClass =
                category === "günstig"
                  ? "bg-green-100"
                  : category === "teuer"
                  ? "bg-red-100"
                  : category === "normal"
                  ? "bg-gray-100"
                  : "bg-gray-50"

              const textClass =
                category === "günstig"
                  ? "text-green-700"
                  : category === "teuer"
                  ? "text-red-700"
                  : category === "normal"
                  ? "text-gray-700"
                  : "text-gray-400"

              return (
                <TooltipProvider key={month}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`rounded-lg p-2 text-center text-xs font-medium cursor-help ${bgClass} ${textClass} ${
                          isCurrentMonth
                            ? "ring-2 ring-offset-1 ring-blue-400"
                            : ""
                        }`}
                      >
                        {monthNames[month - 1]}
                        {isCurrentMonth && (
                          <div className="text-xs text-blue-600 font-bold mt-0.5">•</div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {monthData
                        ? `Ø Preis: ${formatEuro(monthData.avg_preis_cents)} €`
                        : "Keine Daten"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-gray-500 justify-center pt-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" />
              Günstig
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-300" />
              Normal
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />
              Teuer
            </div>
          </div>

          {/* Warning if insufficient data */}
          {saisonData.warning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              {saisonData.warning}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function PriceChartSheet({
  open,
  onOpenChange,
  initialProduct,
}: PriceChartSheetProps) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Price analysis state
  const [preisentwicklung, setPreisentwicklung] = useState<PreisentwicklungData | null>(null)
  const [preisentwicklungLoading, setPreisentwicklungLoading] = useState(false)

  // Season analysis state
  const [saisonData, setSaisonData] = useState<SeasonData | null>(null)
  const [saisonDataLoading, setSaisonDataLoading] = useState(false)

  // Product search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  // Set initial product when sheet opens
  useEffect(() => {
    if (open && initialProduct) {
      setSelectedProduct(initialProduct)
    }
  }, [open, initialProduct])

  // Fetch price data when product changes
  const fetchPrices = useCallback(async (productName: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/produkte/${encodeURIComponent(productName)}/preise`
      )
      if (!res.ok) throw new Error("Fehler beim Laden der Preisdaten")
      const json: PriceData = await res.json()
      setPriceData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProduct && open) {
      fetchPrices(selectedProduct)
    }
  }, [selectedProduct, open, fetchPrices])

  const fetchPreisentwicklung = useCallback(async (productName: string) => {
    setPreisentwicklungLoading(true)
    try {
      const res = await fetch(
        `/api/produkte/${encodeURIComponent(productName)}/preisentwicklung`
      )
      if (!res.ok) throw new Error()
      const json: PreisentwicklungData = await res.json()
      setPreisentwicklung(json)
    } catch {
      setPreisentwicklung(null)
    } finally {
      setPreisentwicklungLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProduct && open) {
      fetchPreisentwicklung(selectedProduct)
    }
  }, [selectedProduct, open, fetchPreisentwicklung])

  const fetchSaison = useCallback(async (productName: string) => {
    setSaisonDataLoading(true)
    try {
      const res = await fetch(
        `/api/produkte/${encodeURIComponent(productName)}/saison`
      )
      if (!res.ok) throw new Error()
      const json: SeasonData = await res.json()
      setSaisonData(json)
    } catch {
      setSaisonData(null)
    } finally {
      setSaisonDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProduct && open) {
      fetchSaison(selectedProduct)
    }
  }, [selectedProduct, open, fetchSaison])

  // Fetch product list for search
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await fetch("/api/produkte?sort=frequency&filter=active")
      if (!res.ok) return
      const json = await res.json()
      setProducts(
        json.products.map((p: { raw_name: string; alias: string | null }) => ({
          raw_name: p.raw_name,
          alias: p.alias,
        }))
      )
    } catch {
      // silently fail
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (searchOpen && products.length === 0) {
      fetchProducts()
    }
  }, [searchOpen, products.length, fetchProducts])

  // Reset state when sheet closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedProduct(null)
      setPriceData(null)
      setError(null)
      setPreisentwicklung(null)
      setSaisonData(null)
    }
    onOpenChange(isOpen)
  }

  const displayName = priceData?.alias ?? priceData?.raw_name ?? selectedProduct ?? ""

  // Prepare chart data
  const chartData = (priceData?.preise ?? []).map((p) => ({
    ...p,
    preis: centsToEuro(p.einzelpreis_cents),
    label: formatDate(p.datum),
  }))

  // Summary stats
  const prices = chartData.map((d) => d.preis)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0
  const avgPrice = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : 0

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="truncate">
            {loading ? "Lade..." : displayName || "Preisentwicklung"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-4">
          {/* Product search / switcher */}
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={searchOpen}
                className="w-full justify-between text-sm"
              >
                {selectedProduct
                  ? products.find((p) => p.raw_name === selectedProduct)
                      ?.alias ?? selectedProduct
                  : "Produkt wechseln…"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Produkt suchen…" />
                <CommandList>
                  <CommandEmpty>
                    {productsLoading ? "Lade…" : "Kein Produkt gefunden."}
                  </CommandEmpty>
                  <CommandGroup>
                    {products.map((product) => (
                      <CommandItem
                        key={product.raw_name}
                        value={`${product.raw_name} ${product.alias ?? ""}`}
                        onSelect={() => {
                          setSelectedProduct(product.raw_name)
                          setSearchOpen(false)
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedProduct === product.raw_name
                              ? "opacity-100"
                              : "opacity-0"
                          }`}
                        />
                        <div className="flex flex-col">
                          {product.alias && (
                            <span className="text-sm font-medium">
                              {product.alias}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 font-mono">
                            {product.raw_name}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-[250px] w-full" />
              <div className="flex gap-4">
                <Skeleton className="h-16 flex-1" />
                <Skeleton className="h-16 flex-1" />
                <Skeleton className="h-16 flex-1" />
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-red-600 text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => selectedProduct && fetchPrices(selectedProduct)}
              >
                Erneut versuchen
              </Button>
            </div>
          )}

          {/* Single purchase hint */}
          {!loading && !error && chartData.length === 1 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-amber-700 font-medium mb-1">
                Nur ein Kauf vorhanden
              </p>
              <p className="text-amber-600 text-sm">
                Kein Trend darstellbar. Preis: {formatEuro(chartData[0].einzelpreis_cents)} &euro; am{" "}
                {formatDate(chartData[0].datum)}
              </p>
            </div>
          )}

          {/* No data */}
          {!loading && !error && chartData.length === 0 && priceData && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-gray-500">Keine Preisdaten vorhanden.</p>
            </div>
          )}

          {/* Chart */}
          {!loading && !error && chartData.length >= 2 && (
            <>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v.toFixed(2)} €`}
                      width={70}
                    />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="preis"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={<CustomDot />}
                      activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-gray-500 justify-center">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
                  Normaler Kauf
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
                  Mit Rabatt
                </div>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-100 bg-white p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Niedrigster</p>
                  <p className="text-lg font-semibold text-green-600">
                    {minPrice.toFixed(2).replace(".", ",")} &euro;
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Durchschnitt</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {avgPrice.toFixed(2).replace(".", ",")} &euro;
                  </p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">H&ouml;chster</p>
                  <p className="text-lg font-semibold text-red-600">
                    {maxPrice.toFixed(2).replace(".", ",")} &euro;
                  </p>
                </div>
              </div>

              {/* Price analysis section */}
              {preisentwicklungLoading && (
                <div className="space-y-2 pt-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}

              {!preisentwicklungLoading && preisentwicklung && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Preisentwicklung</h3>

                  {/* Gesamt-Veränderung */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm text-gray-600">
                        Erster Kauf:{" "}
                        <span className="font-medium text-gray-900">
                          {formatEuro(preisentwicklung.gesamt.erster_kauf.preis_cents)} &euro;
                        </span>{" "}
                        <span className="text-xs text-gray-400">
                          ({formatDate(preisentwicklung.gesamt.erster_kauf.datum)})
                        </span>
                      </span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-sm text-gray-600">
                        Letzter Kauf:{" "}
                        <span className="font-medium text-gray-900">
                          {formatEuro(preisentwicklung.gesamt.letzter_kauf.preis_cents)} &euro;
                        </span>{" "}
                        <span className="text-xs text-gray-400">
                          ({formatDate(preisentwicklung.gesamt.letzter_kauf.datum)})
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span
                        className={`text-sm font-semibold ${
                          preisentwicklung.gesamt.veraenderung_cents > 0
                            ? "text-red-600"
                            : preisentwicklung.gesamt.veraenderung_cents < 0
                            ? "text-green-600"
                            : "text-gray-500"
                        }`}
                      >
                        {preisentwicklung.gesamt.veraenderung_cents > 0 ? "+" : ""}
                        {formatEuro(preisentwicklung.gesamt.veraenderung_cents)} &euro;
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          preisentwicklung.gesamt.veraenderung_cents > 0
                            ? "bg-red-50 text-red-600"
                            : preisentwicklung.gesamt.veraenderung_cents < 0
                            ? "bg-green-50 text-green-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {preisentwicklung.gesamt.veraenderung_prozent > 0 ? "+" : ""}
                        {preisentwicklung.gesamt.veraenderung_prozent.toFixed(1).replace(".", ",")}%
                        {" "}seit erstem Kauf
                      </span>
                    </div>
                  </div>

                  {/* CAGR Summary */}
                  {preisentwicklung.inflation_cagr_pct !== null && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-blue-900 font-medium">
                          Ø Inflation p.a.
                        </span>
                        <span
                          className={`text-sm font-semibold ${
                            preisentwicklung.inflation_cagr_pct > 0
                              ? "text-red-600"
                              : preisentwicklung.inflation_cagr_pct < 0
                              ? "text-green-600"
                              : "text-gray-500"
                          }`}
                        >
                          {preisentwicklung.inflation_cagr_pct > 0 ? "+" : ""}
                          {preisentwicklung.inflation_cagr_pct.toFixed(1).replace(".", ",")}%
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Jahr-zu-Jahr table */}
                  {preisentwicklung.jahre.length >= 2 ? (
                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-xs font-medium text-gray-500 w-16">Jahr</TableHead>
                            <TableHead className="text-xs font-medium text-gray-500 text-right">Ø Preis</TableHead>
                            <TableHead className="text-xs font-medium text-gray-500 text-right">Zum Vorjahr</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preisentwicklung.jahre.map((row) => (
                            <TableRow key={row.jahr} className="text-sm">
                              <TableCell className="font-medium text-gray-900">
                                <div className="flex items-center gap-2">
                                  {row.jahr}
                                  {row.is_partial_year && (
                                    <Badge variant="outline" className="text-xs py-0 px-1.5 h-5 bg-amber-50 border-amber-200 text-amber-700">
                                      Teiljahr
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-gray-700">
                                {formatEuro(row.avg_preis_cents)} &euro;
                              </TableCell>
                              <TableCell className="text-right">
                                {row.veraenderung_cents === null ? (
                                  <span className="text-gray-400 text-xs">—</span>
                                ) : (
                                  <span
                                    className={`font-medium ${
                                      row.veraenderung_cents > 0
                                        ? "text-red-600"
                                        : row.veraenderung_cents < 0
                                        ? "text-green-600"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    {row.veraenderung_cents > 0 ? "+" : ""}
                                    {formatEuro(row.veraenderung_cents)} &euro;{" "}
                                    <span className="text-xs font-normal">
                                      ({row.veraenderung_prozent! > 0 ? "+" : ""}
                                      {row.veraenderung_prozent!.toFixed(1).replace(".", ",")}%)
                                    </span>
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-1">
                      Noch keine jahres&uuml;bergreifenden Daten
                    </p>
                  )}
                </div>
              )}

              {/* Season calendar section */}
              <SeasonCalendar saisonData={saisonData} isLoading={saisonDataLoading} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
