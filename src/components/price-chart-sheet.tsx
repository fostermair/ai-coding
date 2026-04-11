"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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

export function PriceChartSheet({
  open,
  onOpenChange,
  initialProduct,
}: PriceChartSheetProps) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
