"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { BarChart3, TrendingUp, TrendingDown, Upload, Minus, EyeOff } from "lucide-react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
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

interface MonatlichAlleData {
  monate: { monat: string; ausgaben_cents: number }[]
}

interface TopProdukteData {
  produkte: {
    raw_name: string
    alias: string | null
    kaufhaeufigkeit: number
    gesamt_cents: number
  }[]
}

interface InflationProdukt {
  raw_name: string
  alias: string | null
  avg_vorjahr_cents: number
  avg_aktuell_cents: number
  aenderung_prozent: number
}

interface InflationData {
  teuer: InflationProdukt[]
  guenstiger: InflationProdukt[]
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

interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string
  letzter_einkauf?: { datum: string; gesamt_cents: number }
  vergleich?: { datum: string; typ: "vorjahr" | "voreinkauf"; gesamt_cents: number }
  vergleich_stats?: {
    differenz_cents: number
    differenz_prozent: number
    produkte_gezaehlt: number
    produkte_gesamt: number
  }
}

type Zeitraum = "3" | "6" | "12" | "alle"
type TopSort = "frequency" | "spending" | "preissteigerung" | "verguenstigung"

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z")
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function fillMonthGaps(monate: { monat: string; ausgaben_cents: number }[]): { monat: string; ausgaben_cents: number }[] {
  if (monate.length === 0) return []

  const dataMap = new Map(monate.map((m) => [m.monat, m.ausgaben_cents]))
  const [firstYearMonth, firstMonth] = monate[0].monat.split("-").map(Number)
  const [lastYearMonth, lastMonth] = monate[monate.length - 1].monat.split("-").map(Number)

  const result: { monat: string; ausgaben_cents: number }[] = []
  let currentYear = firstYearMonth
  let currentMonth = firstMonth

  while (currentYear < lastYearMonth || (currentYear === lastYearMonth && currentMonth <= lastMonth)) {
    const monatStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`
    result.push({
      monat: monatStr,
      ausgaben_cents: dataMap.get(monatStr) ?? 0,
    })

    currentMonth++
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }
  }

  return result
}

function calculateAverage(monate: { ausgaben_cents: number }[]): number {
  if (monate.length === 0) return 0
  const total = monate.reduce((sum, m) => sum + m.ausgaben_cents, 0)
  return total / monate.length
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

function LangzeitstrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { monat: string; ausgaben_cents: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{formatMonat(d.monat)}</p>
      <p>Ausgaben: <span className="font-semibold">{formatEuro(d.ausgaben_cents)} &euro;</span></p>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export function StatistikDashboard() {
  const [zeitraum, setZeitraum] = useState<Zeitraum>("alle")
  const [monatlich, setMonatlich] = useState<MonatlichData | null>(null)
  const [monatlichAlle, setMonatlichAlle] = useState<MonatlichAlleData | null>(null)
  const [topProdukte, setTopProdukte] = useState<TopProdukteData | null>(null)
  const [inflation, setInflation] = useState<InflationData | null>(null)
  const [rabatte, setRabatte] = useState<RabatteData | null>(null)
  const [mwst, setMwst] = useState<MwstData | null>(null)
  const [einkaufsverbgleichVorjahr, setEinkaufsverbgleichVorjahr] = useState<EinkaufsverbgleichResponse | null>(null)
  const [einkaufsverbgleichVoreinkauf, setEinkaufsverbgleichVoreinkauf] = useState<EinkaufsverbgleichResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEmpty, setIsEmpty] = useState(false)
  const [excludedCount, setExcludedCount] = useState(0)

  // Price chart integration (PROJ-4)
  const [chartOpen, setChartOpen] = useState(false)
  const [chartProduct, setChartProduct] = useState<string | null>(null)

  const [topSort, setTopSort] = useState<TopSort>("frequency")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const monateParam = zeitraum !== "alle" ? `monate=${zeitraum}` : ""

    function buildUrl(base: string, extra?: string) {
      const parts = [monateParam, extra].filter(Boolean)
      return parts.length > 0 ? `${base}?${parts.join("&")}` : base
    }

    try {
      const [monatRes, monatAlleRes, rabattRes, mwstRes, excludedRes, vorjahrRes, voreinkaufRes, inflationRes] = await Promise.all([
        fetch(buildUrl("/api/statistiken/monatlich")),
        fetch("/api/statistiken/monatlich"),
        fetch(buildUrl("/api/statistiken/rabatte")),
        fetch(buildUrl("/api/statistiken/mwst")),
        fetch("/api/produkte?filter=excluded"),
        fetch("/api/statistiken/einkaufskorb-vergleich/vorjahr"),
        fetch("/api/statistiken/einkaufskorb-vergleich/voreinkauf"),
        fetch("/api/statistiken/inflation"),
      ])

      const monatJson: MonatlichData = await monatRes.json()
      const monatAlleJson: MonatlichAlleData = await monatAlleRes.json()
      const rabattJson: RabatteData = await rabattRes.json()
      const mwstJson: MwstData = await mwstRes.json()
      const excludedJson: { excluded_count: number } = await excludedRes.json()
      const vorjahrJson: EinkaufsverbgleichResponse = await vorjahrRes.json()
      const voreinkaufJson: EinkaufsverbgleichResponse = await voreinkaufRes.json()
      const inflationJson: InflationData = await inflationRes.json()

      setMonatlich(monatJson)
      setMonatlichAlle(monatAlleJson)
      setInflation(inflationJson)
      setRabatte(rabattJson)
      setMwst(mwstJson)
      setExcludedCount(excludedJson.excluded_count ?? 0)
      setEinkaufsverbgleichVorjahr(vorjahrJson)
      setEinkaufsverbgleichVoreinkauf(voreinkaufJson)

      setIsEmpty(monatJson.monate.length === 0)
    } catch {
      // silently fail — individual cards show empty states
    } finally {
      setLoading(false)
    }
  }, [zeitraum])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const fetchTopProdukte = useCallback(async () => {
    const params = new URLSearchParams({ sort: topSort })
    if (zeitraum !== "alle") params.set("monate", zeitraum)
    try {
      const res = await fetch(`/api/statistiken/top-produkte?${params}`)
      const json: TopProdukteData = await res.json()
      setTopProdukte(json)
    } catch {
      // silently fail
    }
  }, [zeitraum, topSort])

  useEffect(() => {
    if (topSort === "frequency" || topSort === "spending") {
      fetchTopProdukte()
    }
  }, [fetchTopProdukte])

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
    euro: centsToEuro(Math.abs(m.ersparnis_cents)),
    label: formatMonat(m.monat),
  }))

  const mwstChartData = (mwst?.kategorien ?? []).map((k) => ({
    ...k,
    euro: centsToEuro(k.gesamt_cents),
  }))

  return (
    <div className="space-y-6">
      {/* Zeitraum-Filter + Ausgeblendet-Hinweis */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {excludedCount > 0 ? (
          <Link
            href="/produkte?filter=excluded"
            className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 transition-colors"
            title="Zur Produktverwaltung"
          >
            <EyeOff className="h-3.5 w-3.5" />
            {excludedCount} Produkt{excludedCount !== 1 ? "e" : ""} ausgeblendet
          </Link>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
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
              <Tabs value={topSort} onValueChange={(v) => setTopSort(v as TopSort)}>
                <TabsList className="mb-3">
                  <TabsTrigger value="frequency">Häufigste</TabsTrigger>
                  <TabsTrigger value="spending">Teuerste</TabsTrigger>
                  <TabsTrigger value="preissteigerung">Preissteigerung</TabsTrigger>
                  <TabsTrigger value="verguenstigung">Vergünstigung</TabsTrigger>
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
                <TabsContent value="preissteigerung">
                  <InflationsListe
                    produkte={inflation?.teuer ?? []}
                    richtung="teuer"
                    onProductClick={(name) => { setChartProduct(name); setChartOpen(true) }}
                  />
                </TabsContent>
                <TabsContent value="verguenstigung">
                  <InflationsListe
                    produkte={inflation?.guenstiger ?? []}
                    richtung="guenstiger"
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
              {rabatte && rabatte.gesamt_ersparnis_cents !== 0 && (
                <span className="text-lg font-semibold text-green-600">
                  {formatEuro(Math.abs(rabatte.gesamt_ersparnis_cents))} &euro; gespart
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

          {/* ── Karte 5: Einkaufskorb-Vergleich: Vorjahr ────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Einkaufskorb-Vergleich: Vorjahr</CardTitle>
            </CardHeader>
            <CardContent>
              {einkaufsverbgleichVorjahr ? (
                einkaufsverbgleichVorjahr.kann_vergleichen ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Letzter Einkauf</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(einkaufsverbgleichVorjahr.letzter_einkauf!.datum)}</p>
                        <p className="text-lg font-semibold text-gray-900">{formatEuro(einkaufsverbgleichVorjahr.letzter_einkauf!.gesamt_cents)} &euro;</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">vor ~1 Jahr</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(einkaufsverbgleichVorjahr.vergleich!.datum)}</p>
                        <p className="text-lg font-semibold text-gray-700">{formatEuro(einkaufsverbgleichVorjahr.vergleich!.gesamt_cents)} &euro;</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-sm text-gray-600">Differenz:</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${einkaufsverbgleichVorjahr.vergleich_stats!.differenz_cents >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {einkaufsverbgleichVorjahr.vergleich_stats!.differenz_cents >= 0 ? '+' : ''}{formatEuro(einkaufsverbgleichVorjahr.vergleich_stats!.differenz_cents)} &euro;
                        </span>
                        <Badge variant={einkaufsverbgleichVorjahr.vergleich_stats!.differenz_cents >= 0 ? "destructive" : "secondary"} className="text-xs">
                          {einkaufsverbgleichVorjahr.vergleich_stats!.differenz_prozent >= 0 ? '+' : ''}{einkaufsverbgleichVorjahr.vergleich_stats!.differenz_prozent}%
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      {einkaufsverbgleichVorjahr.vergleich_stats!.produkte_gezaehlt} von {einkaufsverbgleichVorjahr.vergleich_stats!.produkte_gesamt} Produkten im Vergleich
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500">{einkaufsverbgleichVorjahr.reason}</p>
                  </div>
                )
              ) : (
                <Skeleton className="h-[120px] w-full" />
              )}
            </CardContent>
          </Card>

          {/* ── Karte 6: Einkaufskorb-Vergleich: Voreinkauf ─────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Einkaufskorb-Vergleich: Voreinkauf</CardTitle>
            </CardHeader>
            <CardContent>
              {einkaufsverbgleichVoreinkauf ? (
                einkaufsverbgleichVoreinkauf.kann_vergleichen ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Letzter Einkauf</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(einkaufsverbgleichVoreinkauf.letzter_einkauf!.datum)}</p>
                        <p className="text-lg font-semibold text-gray-900">{formatEuro(einkaufsverbgleichVoreinkauf.letzter_einkauf!.gesamt_cents)} &euro;</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Vorheriger Einkauf</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(einkaufsverbgleichVoreinkauf.vergleich!.datum)}</p>
                        <p className="text-lg font-semibold text-gray-700">{formatEuro(einkaufsverbgleichVoreinkauf.vergleich!.gesamt_cents)} &euro;</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <span className="text-sm text-gray-600">Differenz:</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${einkaufsverbgleichVoreinkauf.vergleich_stats!.differenz_cents >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {einkaufsverbgleichVoreinkauf.vergleich_stats!.differenz_cents >= 0 ? '+' : ''}{formatEuro(einkaufsverbgleichVoreinkauf.vergleich_stats!.differenz_cents)} &euro;
                        </span>
                        <Badge variant={einkaufsverbgleichVoreinkauf.vergleich_stats!.differenz_cents >= 0 ? "destructive" : "secondary"} className="text-xs">
                          {einkaufsverbgleichVoreinkauf.vergleich_stats!.differenz_prozent >= 0 ? '+' : ''}{einkaufsverbgleichVoreinkauf.vergleich_stats!.differenz_prozent}%
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      {einkaufsverbgleichVoreinkauf.vergleich_stats!.produkte_gezaehlt} von {einkaufsverbgleichVoreinkauf.vergleich_stats!.produkte_gesamt} Produkten im Vergleich
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500">{einkaufsverbgleichVoreinkauf.reason}</p>
                  </div>
                )
              ) : (
                <Skeleton className="h-[120px] w-full" />
              )}
            </CardContent>
          </Card>

          {/* ── Karte 7: Monatlicher Ausgaben-Langzeittrend ──────────── */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Monatlicher Ausgaben-Langzeittrend</CardTitle>
            </CardHeader>
            <CardContent>
              {monatlichAlle && monatlichAlle.monate.length > 0 ? (
                (() => {
                  const filledData = fillMonthGaps(monatlichAlle.monate)
                  const chartData = filledData.map((m) => ({
                    ...m,
                    euro: centsToEuro(m.ausgaben_cents),
                    label: formatMonat(m.monat),
                  }))
                  const averageCents = calculateAverage(filledData)
                  const averageEuro = centsToEuro(averageCents)

                  return (
                    <div className="space-y-4">
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              interval={chartData.length > 12 ? Math.floor(chartData.length / 12) : 0}
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              tickFormatter={(v: number) => `${v.toFixed(0)} €`}
                              width={60}
                            />
                            <RechartsTooltip content={<LangzeitstrendTooltip />} />
                            <Line
                              type="monotone"
                              dataKey="euro"
                              stroke="#3b82f6"
                              dot={chartData.length <= 12}
                              isAnimationActive={false}
                              strokeWidth={2}
                            />
                            <ReferenceLine
                              y={averageEuro}
                              stroke="#6b7280"
                              strokeDasharray="5 5"
                              label={{
                                value: `⌀ ${averageEuro.toFixed(2)} €`,
                                position: "right",
                                fill: "#6b7280",
                                fontSize: 11,
                              }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="text-sm text-gray-600">Durchschnitt:</span>
                        <span className="text-lg font-semibold text-gray-900">{formatEuro(averageCents)} &euro;</span>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <p className="text-sm text-gray-400 text-center py-10">Keine Daten vorhanden</p>
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
              {p.alias || p.raw_name}
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

// ── Sub-Component: Inflations Liste ────────────────────────────────────────

function InflationsListe({
  produkte,
  richtung,
  onProductClick,
}: {
  produkte: InflationProdukt[]
  richtung: "teuer" | "guenstiger"
  onProductClick: (rawName: string) => void
}) {
  if (produkte.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">Keine Jahresvergleichsdaten vorhanden</p>
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
              {p.alias || p.raw_name}
            </p>
            {p.alias && (
              <p className="text-xs text-gray-400 font-mono truncate">{p.raw_name}</p>
            )}
            <p className="text-xs text-gray-400 tabular-nums">
              {formatEuro(p.avg_vorjahr_cents)} € → {formatEuro(p.avg_aktuell_cents)} €
            </p>
          </div>
          <span className={`text-sm font-semibold tabular-nums shrink-0 ${richtung === "teuer" ? "text-red-600" : "text-green-600"}`}>
            {p.aenderung_prozent > 0 ? "+" : ""}{p.aenderung_prozent}%
          </span>
        </button>
      ))}
    </div>
  )
}
