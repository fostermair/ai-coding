"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, TrendingDown, Upload, Minus } from "lucide-react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { formatEuro } from "@/lib/format"
import { PriceChartSheet } from "@/components/price-chart-sheet"

// ── Types ──────────────────────────────────────────────────────────────────

interface MonatlichData {
  monate: { monat: string; ausgaben_cents: number }[]
  vergleich: {
    aktuell_monat: string
    vormonat: string
    diff_cents: number
    diff_prozent: number
  } | null
}

interface TopProdukteData {
  produkte: {
    raw_name: string
    alias: string | null
    kaufhaeufigkeit: number
    gesamt_cents: number
  }[]
}

interface RabatteData {
  gesamt_ersparnis_cents: number
  monatlich: { monat: string; ersparnis_cents: number }[]
  top_aktionen: { beschreibung: string; anzahl: number; gesamt_cents: number }[]
}

interface MwstData {
  kategorien: {
    tax_code: string
    label: string
    gesamt_cents: number
    anteil_prozent: number
  }[]
  gesamt_cents: number
}

type Zeitraum = "3" | "6" | "12" | "alle"

const ZEITRAUM_LABELS: Record<Zeitraum, string> = {
  "3": "3M",
  "6": "6M",
  "12": "12M",
  alle: "Alle",
}

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f97316", "#a855f7"]

function centsToEuro(cents: number): number {
  return cents / 100
}

function formatMonat(ym: string): string {
  const [y, m] = ym.split("-")
  const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`
}

// ── Custom Tooltips ────────────────────────────────────────────────────────

function MonatTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { monat: string; ausgaben_cents: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{formatMonat(d.monat)}</p>
      <p>Ausgaben: <span className="font-semibold">{formatEuro(d.ausgaben_cents)} &euro;</span></p>
    </div>
  )
}

function RabattMonatTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { monat: string; ersparnis_cents: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{formatMonat(d.monat)}</p>
      <p>Ersparnis: <span className="font-semibold">{formatEuro(d.ersparnis_cents)} &euro;</span></p>
    </div>
  )
}

function MwstTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; gesamt_cents: number; anteil_prozent: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{d.label}</p>
      <p>{formatEuro(d.gesamt_cents)} &euro; ({d.anteil_prozent}%)</p>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function StatistikDashboard() {
  const [zeitraum, setZeitraum] = useState<Zeitraum>("alle")
  const [monatlich, setMonatlich] = useState<MonatlichData | null>(null)
  const [topProdukte, setTopProdukte] = useState<TopProdukteData | null>(null)
  const [rabatte, setRabatte] = useState<RabatteData | null>(null)
  const [mwst, setMwst] = useState<MwstData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)

  // Price chart integration (PROJ-4)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartProduct, setChartProduct] = useState<string | null>(null)

  const [topSort, setTopSort] = useState<"frequency" | "spending">("frequency")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const qs = zeitraum !== "alle" ? `?monate=${zeitraum}` : ""

    try {
      const [monatRes, topRes, rabattRes, mwstRes] = await Promise.all([
        fetch(`/api/statistiken/monatlich${qs}`),
        fetch(`/api/statistiken/top-produkte${qs}&sort=${topSort}`),
        fetch(`/api/statistiken/rabatte${qs}`),
        fetch(`/api/statistiken/mwst${qs}`),
      ])

      const monatJson: MonatlichData = await monatRes.json()
      const topJson: TopProdukteData = await topRes.json()
      const rabattJson: RabatteData = await rabattRes.json()
      const mwstJson: MwstData = await mwstRes.json()

      setMonatlich(monatJson)
      setTopProdukte(topJson)
      setRabatte(rabattJson)
      setMwst(mwstJson)

      setIsEmpty(
        monatJson.monate.length === 0 &&
        topJson.produkte.length === 0
      )
    } catch {
      // silently fail — individual cards show empty states
    } finally {
      setLoading(false)
    }
  }, [zeitraum, topSort])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Refetch top products when sort changes (without refetching everything)
  const fetchTopProdukte = useCallback(async () => {
    const qs = zeitraum !== "alle" ? `monate=${zeitraum}&` : ""
    try {
      const res = await fetch(`/api/statistiken/top-produkte?${qs}sort=${topSort}`)
      const json: TopProdukteData = await res.json()
      setTopProdukte(json)
    } catch {
      // silently fail
    }
  }, [zeitraum, topSort])

  // When only topSort changes, just refetch top products
  useEffect(() => {
    if (!loading) {
      fetchTopProdukte()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSort])

  // ── Empty state ────────────────────────────────────────────────────────
  if (!loading && isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <div className="rounded-full bg-gray-100 p-4 mb-4">
          <BarChart3 className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-lg font-medium text-gray-700 mb-1">
          Noch keine Daten für Statistiken
        </h2>
        <p className="text-sm text-gray-400 mb-6 max-w-sm">
          Importiere zuerst eBons, damit die Statistiken berechnet werden können.
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

  // Chart data preparation
  const monatChartData = (monatlich?.monate ?? []).map((m) => ({
    ...m,
    euro: centsToEuro(m.ausgaben_cents),
    label: formatMonat(m.monat),
  }))

  const rabattChartData = (rabatte?.monatlich ?? []).map((m) => ({
    ...m,
    euro: centsToEuro(m.ersparnis_cents),
    label: formatMonat(m.monat),
  }))

  const mwstChartData = (mwst?.kategorien ?? []).map((k) => ({
    ...k,
    euro: centsToEuro(k.gesamt_cents),
  }))

  return (
    <div className="space-y-6">
      {/* Zeitraum-Filter */}
      <div className="flex items-center justify-end gap-1">
        {(Object.keys(ZEITRAUM_LABELS) as Zeitraum[]).map((key) => (
          <Button
            key={key}
            variant={zeitraum === key ? "default" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setZeitraum(key)}
          >
            {ZEITRAUM_LABELS[key]}
          </Button>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent><Skeleton className="h-[250px] w-full" /></CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── Karte 1: Monatliche Ausgaben ─────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-medium">Monatliche Ausgaben</CardTitle>
              {monatlich?.vergleich && (
                <Badge
                  variant={monatlich.vergleich.diff_cents > 0 ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {monatlich.vergleich.diff_cents > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : monatlich.vergleich.diff_cents < 0 ? (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  ) : (
                    <Minus className="h-3 w-3 mr-1" />
                  )}
                  {monatlich.vergleich.diff_prozent > 0 ? "+" : ""}
                  {monatlich.vergleich.diff_prozent}% vs. Vormonat
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {monatChartData.length > 0 ? (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monatChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)} €`} width={60} />
                      <RechartsTooltip content={<MonatTooltip />} />
                      <Bar dataKey="euro" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-10">Keine Daten vorhanden</p>
              )}
            </CardContent>
          </Card>

          {/* ── Karte 2: Top-10 Produkte ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Top-10 Produkte</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={topSort} onValueChange={(v) => setTopSort(v as "frequency" | "spending")}>
                <TabsList className="mb-3">
                  <TabsTrigger value="frequency">Häufigste</TabsTrigger>
                  <TabsTrigger value="spending">Teuerste</TabsTrigger>
                </TabsList>
                <TabsContent value="frequency">
                  <TopProdukteListe
                    produkte={topProdukte?.produkte ?? []}
                    mode="frequency"
                    onProductClick={(name) => { setChartProduct(name); setChartOpen(true) }}
                  />
                </TabsContent>
                <TabsContent value="spending">
                  <TopProdukteListe
                    produkte={topProdukte?.produkte ?? []}
                    mode="spending"
                    onProductClick={(name) => { setChartProduct(name); setChartOpen(true) }}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* ── Karte 3: Rabatt-Tracking ─────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-medium">Rabatt-Tracking</CardTitle>
              {rabatte && rabatte.gesamt_ersparnis_cents > 0 && (
                <span className="text-lg font-semibold text-green-600">
                  {formatEuro(rabatte.gesamt_ersparnis_cents)} &euro; gespart
                </span>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {rabattChartData.length > 0 ? (
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rabattChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)} €`} width={60} />
                      <RechartsTooltip content={<RabattMonatTooltip />} />
                      <Bar dataKey="euro" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">Keine Rabattdaten vorhanden</p>
              )}

              {rabatte && rabatte.top_aktionen.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Häufigste Rabattaktionen</p>
                  <div className="space-y-1.5">
                    {rabatte.top_aktionen.map((a) => (
                      <div key={a.beschreibung} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate max-w-[60%]">{a.beschreibung}</span>
                        <span className="text-gray-500 tabular-nums">
                          {a.anzahl}× &middot; {formatEuro(a.gesamt_cents)} &euro;
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Karte 4: MwSt-Aufteilung ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">MwSt-Aufteilung</CardTitle>
            </CardHeader>
            <CardContent>
              {mwstChartData.length > 0 ? (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={mwstChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        dataKey="euro"
                        nameKey="label"
                        paddingAngle={2}
                      >
                        {mwstChartData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<MwstTooltip />} />
                      <Legend
                        formatter={(value: string) => <span className="text-sm text-gray-700">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-10">Keine MwSt-Daten vorhanden</p>
              )}

              {mwstChartData.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {mwst!.kategorien.map((k, i) => (
                    <div key={k.tax_code} className="rounded-lg border border-gray-100 bg-white p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <p className="text-xs text-gray-500">{k.label}</p>
                      </div>
                      <p className="text-lg font-semibold">{formatEuro(k.gesamt_cents)} &euro;</p>
                      <p className="text-xs text-gray-400">{k.anteil_prozent}%</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Price chart sheet (PROJ-4 reuse) */}
      <PriceChartSheet
        open={chartOpen}
        onOpenChange={setChartOpen}
        initialProduct={chartProduct}
      />
    </div>
  )
}

// ── Sub-Component: Top-Produkte Liste ──────────────────────────────────────

function TopProdukteListe({
  produkte,
  mode,
  onProductClick,
}: {
  produkte: TopProdukteData["produkte"]
  mode: "frequency" | "spending"
  onProductClick: (rawName: string) => void
}) {
  if (produkte.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">Keine Produktdaten vorhanden</p>
  }

  return (
    <div className="space-y-1.5">
      {produkte.map((p, i) => (
        <button
          key={p.raw_name}
          className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50 text-left transition-colors cursor-pointer"
          onClick={() => onProductClick(p.raw_name)}
          title="Preisentwicklung anzeigen"
        >
          <span className="text-xs font-medium text-gray-400 w-5 text-right">{i + 1}.</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {p.alias ?? p.raw_name}
            </p>
            {p.alias && (
              <p className="text-xs text-gray-400 font-mono truncate">{p.raw_name}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            {mode === "frequency" ? (
              <span className="text-sm tabular-nums text-gray-600">{p.kaufhaeufigkeit}×</span>
            ) : (
              <span className="text-sm tabular-nums text-gray-600">{formatEuro(p.gesamt_cents)} &euro;</span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
