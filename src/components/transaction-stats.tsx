"use client"

import { useMemo, useState } from "react"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts"

interface Transaction {
  betrag_cents: number
  periode: string
  kategorie: string | null
  kategorie_farbe: string | null
}

interface Props {
  transactions: Transaction[]
}

const FALLBACK_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#84cc16",
]

function formatPeriode(periode: string): string {
  const [year, month] = periode.split("-")
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("de-DE", {
    month: "short",
    year: "numeric",
  })
}

function formatEuroShort(cents: number) {
  return `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

export function TransactionStats({ transactions }: Props) {
  const allExpenses = useMemo(() => transactions.filter((t) => t.betrag_cents < 0), [transactions])

  const availableYears = useMemo(() => {
    const years = [...new Set(allExpenses.map((t) => t.periode.slice(0, 4)))].sort((a, b) => b.localeCompare(a))
    return years
  }, [allExpenses])

  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set())
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())

  const toggleYear = (year: string) => {
    setSelectedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  const expenses = useMemo(
    () =>
      selectedYears.size > 0
        ? allExpenses.filter((t) => selectedYears.has(t.periode.slice(0, 4)))
        : allExpenses,
    [allExpenses, selectedYears],
  )

  const categoryData = useMemo(() => {
    const map = new Map<string, { total: number; farbe: string | null }>()
    for (const tx of expenses) {
      const key = tx.kategorie ?? "Keine Kategorie"
      const entry = map.get(key)
      if (entry) {
        entry.total += Math.abs(tx.betrag_cents)
      } else {
        map.set(key, { total: Math.abs(tx.betrag_cents), farbe: tx.kategorie_farbe })
      }
    }
    return Array.from(map.entries())
      .map(([name, { total, farbe }]) => ({ name, value: total, farbe }))
      .sort((a, b) => b.value - a.value)
  }, [expenses])

  const visibleCategoryData = useMemo(
    () => categoryData.filter((d) => !hiddenCategories.has(d.name)),
    [categoryData, hiddenCategories],
  )

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of expenses) {
      if (hiddenCategories.has(tx.kategorie ?? "Sonstige")) continue
      map.set(tx.periode, (map.get(tx.periode) ?? 0) + Math.abs(tx.betrag_cents))
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([periode, total]) => ({ periode, label: formatPeriode(periode), total }))
  }, [expenses, hiddenCategories])

  const avgMonthly = useMemo(() => {
    if (monthlyData.length === 0) return 0
    return monthlyData.reduce((s, m) => s + m.total, 0) / monthlyData.length
  }, [monthlyData])

  const yearBarData = useMemo(() => {
    const map = new Map<string, { total: number; months: Set<string> }>()
    for (const tx of expenses) {
      if (hiddenCategories.has(tx.kategorie ?? "Keine Kategorie")) continue
      const year = tx.periode.slice(0, 4)
      const entry = map.get(year)
      if (entry) {
        entry.total += Math.abs(tx.betrag_cents)
        entry.months.add(tx.periode)
      } else {
        map.set(year, { total: Math.abs(tx.betrag_cents), months: new Set([tx.periode]) })
      }
    }
    const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    const years = entries.map(([y]) => y)
    const firstYear = years[0]
    const lastYear = years[years.length - 1]
    return entries.map(([year, { total, months }]) => {
      const divisor = year === firstYear || year === lastYear ? months.size : 12
      return {
        year,
        avg: Math.round(total / divisor),
        total,
        monthsUsed: divisor,
      }
    })
  }, [expenses, hiddenCategories])

  const toggleCategory = (name: string) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (allExpenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
        <p className="text-gray-500 font-medium">Keine Ausgaben vorhanden</p>
        <p className="text-sm text-gray-400 mt-1">Importiere einen Kontoauszug, um Statistiken zu sehen.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Year filter (multi-select) */}
      {availableYears.length > 1 && (
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setSelectedYears(new Set())}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedYears.size === 0
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Alle
          </button>
          {availableYears.map((year) => (
            <button
              key={year}
              onClick={() => toggleYear(year)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedYears.has(year)
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Pie chart */}
      <div className="rounded-lg border border-gray-100 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Ausgaben nach Kategorie</h3>
        <div className="flex flex-col lg:flex-row gap-6 items-center">
          <div className="w-full lg:w-auto shrink-0">
            <ResponsiveContainer width={280} height={280}>
              <PieChart>
                <Pie
                  data={visibleCategoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={50}
                >
                  {visibleCategoryData.map((entry, i) => {
                    const originalIndex = categoryData.findIndex((d) => d.name === entry.name)
                    return (
                      <Cell
                        key={entry.name}
                        fill={entry.farbe ?? FALLBACK_COLORS[originalIndex % FALLBACK_COLORS.length]}
                      />
                    )
                  })}
                </Pie>
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [formatEuroShort(value as number), "Ausgaben"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom legend */}
          <div className="flex flex-col gap-1 w-full min-w-0">
            {categoryData.map((entry, i) => {
              const hidden = hiddenCategories.has(entry.name)
              const color = entry.farbe ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              return (
                <button
                  key={entry.name}
                  onClick={() => toggleCategory(entry.name)}
                  className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-md text-sm transition-colors text-left w-full ${
                    hidden
                      ? "opacity-40 hover:opacity-60"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="shrink-0 h-3 w-3 rounded-full"
                      style={{ backgroundColor: hidden ? "#d1d5db" : color }}
                    />
                    <span className={`truncate ${hidden ? "text-gray-400 line-through" : "text-gray-700"}`}>
                      {entry.name}
                    </span>
                  </div>
                  <span className={`tabular-nums shrink-0 ${hidden ? "text-gray-300" : "text-gray-500"}`}>
                    {formatEuroShort(entry.value)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Line chart */}
      <div className="rounded-lg border border-gray-100 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Monatliche Ausgaben</h3>
          <span className="text-xs text-gray-400">
            Ø {formatEuroShort(avgMonthly)} / Monat
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${(v / 100).toFixed(0)} €`}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [formatEuroShort(value as number), "Ausgaben"]}
              labelStyle={{ fontSize: 12, color: "#374151" }}
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
            />
            <ReferenceLine
              y={avgMonthly}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `Ø ${(avgMonthly / 100).toFixed(0)} €`,
                position: "insideTopRight",
                fill: "#94a3b8",
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Year comparison bar chart */}
      {yearBarData.length > 1 && (
        <div className="rounded-lg border border-gray-100 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Ø Monatliche Ausgaben pro Jahr</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={yearBarData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v / 100).toFixed(0)} €`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as { year: string; avg: number; total: number; monthsUsed: number }
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
                      <p className="font-medium text-gray-700 mb-1">{d.year}</p>
                      <p className="text-gray-500">
                        Ø / Monat:{" "}
                        <span className="font-medium text-gray-900">{formatEuroShort(d.avg)}</span>
                        {d.monthsUsed < 12 && (
                          <span className="text-gray-400 ml-1">({d.monthsUsed} Mon.)</span>
                        )}
                      </p>
                      <p className="text-gray-500">
                        Gesamt:{" "}
                        <span className="font-medium text-gray-900">{formatEuroShort(d.total)}</span>
                      </p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                {yearBarData.map((entry, i) => (
                  <Cell key={entry.year} fill={FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
