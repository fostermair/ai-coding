"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Package, Search, ArrowUpDown, ChevronUp, ChevronDown, Check, X, Pencil, Trash2, Upload, TrendingUp, EyeOff, Leaf, Filter, XCircle } from "lucide-react"
import Link from "next/link"
import { formatEuro, formatDate } from "@/lib/format"
import { PriceChartSheet } from "@/components/price-chart-sheet"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  inflation_cagr_pct: number | null
  seasonal?: boolean
  current_month_season?: "günstig" | "normal" | "teuer" | null
}

interface ProdukteResponse {
  products: Product[]
  total_count: number
  excluded_count: number
}

type SortKey = "frequency" | "name" | "last_purchase" | "last_price" | "price_trend" | "inflation_cagr"
type SortDir = "asc" | "desc"

type ColumnFilterText = { type: "text"; value: string }
type ColumnFilterRange = { type: "range"; min: string; max: string }
type ColumnFilterSelect = { type: "select"; value: string }
type ColumnFilter = ColumnFilterText | ColumnFilterRange | ColumnFilterSelect
type ColumnFilterKey = "name" | "alias" | "frequency" | "last_price" | "price_trend" | "inflation_cagr" | "last_purchase" | "season"
type ColumnFilters = Partial<Record<ColumnFilterKey, ColumnFilter>>

const CLIENT_SORT_KEYS: SortKey[] = ["price_trend", "inflation_cagr"]

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

function InflationCAGRBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null

  const isUp = pct > 0
  const isDown = pct < 0
  const arrow = isUp ? "↑" : isDown ? "↓" : "→"
  const formatted = pct === 0 ? "0%" : `${Math.abs(pct).toFixed(1).replace(".", ",")}%`
  const colorClass = isUp
    ? "border-transparent bg-red-100 text-red-700"
    : isDown
    ? "border-transparent bg-green-100 text-green-700"
    : "border-transparent bg-gray-100 text-gray-500"

  return (
    <Badge className={colorClass}>
      {arrow} {formatted} <span className="text-xs ml-0.5">p.a.</span>
    </Badge>
  )
}

function SeasonBadge({ season }: { season: "günstig" | "normal" | "teuer" | null | undefined }) {
  if (!season) return null

  const colorClass =
    season === "günstig"
      ? "border-transparent bg-green-100 text-green-700"
      : season === "teuer"
      ? "border-transparent bg-red-100 text-red-700"
      : "border-transparent bg-gray-100 text-gray-500"

  const label =
    season === "günstig"
      ? "Günstig"
      : season === "teuer"
      ? "Teuer"
      : "Normal"

  return (
    <Badge className={colorClass}>
      {label}
    </Badge>
  )
}

// ── Gemeinsame Tabellenzeile ───────────────────────────────────────────────

function ProductRow({
  product,
  editingName,
  editValue,
  saving,
  editInputRef,
  togglingNames,
  togglingSeasonalNames,
  onStartEdit,
  onCancelEdit,
  onSaveAlias,
  onDeleteAlias,
  onEditValueChange,
  onEditKeyDown,
  onToggleExclude,
  onToggleSeasonal,
  onOpenChart,
}: {
  product: Product
  editingName: string | null
  editValue: string
  saving: boolean
  editInputRef: React.RefObject<HTMLInputElement | null>
  togglingNames: Set<string>
  togglingSeasonalNames: Set<string>
  onStartEdit: (p: Product) => void
  onCancelEdit: () => void
  onSaveAlias: (raw: string) => void
  onDeleteAlias: (raw: string) => void
  onEditValueChange: (v: string) => void
  onEditKeyDown: (e: React.KeyboardEvent, raw: string) => void
  onToggleExclude: (p: Product) => void
  onToggleSeasonal: (p: Product) => void
  onOpenChart: (raw: string) => void
}) {
  return (
    <TableRow key={product.raw_name}>
      {/* Raw name */}
      <TableCell className="font-medium font-mono text-xs text-gray-600 min-w-[200px]">
        <span className="truncate block">{product.raw_name}</span>
      </TableCell>

      {/* Alias (inline-editable) */}
      <TableCell className="hidden sm:table-cell min-w-[180px]">
        {editingName === product.raw_name ? (
          <div className="flex items-center gap-1">
            <Input
              ref={editInputRef}
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={(e) => onEditKeyDown(e, product.raw_name)}
              className="h-7 text-sm"
              placeholder="Alias eingeben…"
              disabled={saving}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
              onClick={() => onSaveAlias(product.raw_name)}
              disabled={saving}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
              onClick={onCancelEdit}
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
                  onClick={() => onStartEdit(product)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                  onClick={() => onDeleteAlias(product.raw_name)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <button
                className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-1"
                onClick={() => onStartEdit(product)}
              >
                <Pencil className="h-3 w-3" />
                Alias setzen
              </button>
            )}
          </div>
        )}
      </TableCell>

      {/* Purchase count */}
      <TableCell className="text-right tabular-nums min-w-[60px]">
        {product.purchase_count}×
      </TableCell>

      {/* Last price */}
      <TableCell className="text-right tabular-nums hidden sm:table-cell min-w-[100px]">
        {formatEuro(product.last_price_cents)} €
      </TableCell>

      {/* Price trend badge */}
      <TableCell className="text-right hidden sm:table-cell min-w-[90px]">
        <PriceTrendBadge
          pct={product.price_trend_pct ?? null}
          fromDate={product.trend_from_date}
          toDate={product.trend_to_date}
          onClick={() => onOpenChart(product.raw_name)}
        />
      </TableCell>

      {/* Inflation CAGR badge */}
      <TableCell className="text-right hidden md:table-cell min-w-[120px]">
        <InflationCAGRBadge pct={product.inflation_cagr_pct ?? null} />
      </TableCell>

      {/* Last purchase date */}
      <TableCell className="text-right text-gray-500 hidden md:table-cell min-w-[100px]">
        {formatDate(product.last_purchase_date)}
      </TableCell>

      {/* Saison: badge + toggle button */}
      <TableCell className="text-center hidden sm:table-cell space-x-1 min-w-[80px]">
        <div className="flex items-center justify-center gap-1">
          {product.seasonal && (
            <SeasonBadge season={product.current_month_season} />
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${
              product.seasonal
                ? "text-green-600 hover:text-green-700"
                : "text-gray-400 hover:text-gray-600"
            }`}
            title={product.seasonal ? "Als nicht-saisonal markieren" : "Als saisonal markieren"}
            onClick={() => onToggleSeasonal(product)}
            disabled={togglingSeasonalNames.has(product.raw_name)}
          >
            <Leaf className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>

      {/* Exclude from stats toggle */}
      <TableCell className="text-center hidden sm:table-cell min-w-[100px]">
        <Switch
          checked={!product.excluded_from_stats}
          onCheckedChange={() => onToggleExclude(product)}
          disabled={togglingNames.has(product.raw_name)}
          aria-label={
            product.excluded_from_stats
              ? `${product.raw_name} in Statistiken anzeigen`
              : `${product.raw_name} aus Statistiken ausblenden`
          }
        />
      </TableCell>

      {/* Price chart button */}
      <TableCell className="text-center whitespace-nowrap min-w-[50px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                onClick={() => onOpenChart(product.raw_name)}
              >
                <TrendingUp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Preisentwicklung</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  )
}

// ── Gemeinsamer Tabellen-Header ────────────────────────────────────────────

interface ProductTableHeaderProps {
  sort: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  columnFilters: ColumnFilters
  onFilterChange: (key: ColumnFilterKey, filter: ColumnFilter | undefined) => void
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40 shrink-0" />
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 shrink-0" />
    : <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
}

function TextFilterPopover({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onReset: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${
            value.trim() ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          }`}
          title={`${label} filtern`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">{label}</p>
          <Input
            placeholder={`${label} eingeben…`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 text-sm"
          />
          {value.trim() && (
            <Button
              variant="link"
              size="sm"
              className="h-6 p-0 text-xs text-gray-500"
              onClick={onReset}
            >
              Zurücksetzen
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RangeFilterPopover({
  label,
  unit,
  min,
  max,
  onMinChange,
  onMaxChange,
  onReset,
}: {
  label: string
  unit: string
  min: string
  max: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
  onReset: () => void
}) {
  const hasValue = min.trim() || max.trim()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${
            hasValue ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          }`}
          title={`${label} filtern`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-700">{label}</p>
          <div>
            <label className="text-xs text-gray-600">Minimum {unit}</label>
            <Input
              type="number"
              placeholder="Min"
              value={min}
              onChange={(e) => onMinChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Maximum {unit}</label>
            <Input
              type="number"
              placeholder="Max"
              value={max}
              onChange={(e) => onMaxChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {hasValue && (
            <Button
              variant="link"
              size="sm"
              className="h-6 p-0 text-xs text-gray-500"
              onClick={onReset}
            >
              Zurücksetzen
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DateRangeFilterPopover({
  label,
  from,
  to,
  onFromChange,
  onToChange,
  onReset,
}: {
  label: string
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  onReset: () => void
}) {
  const hasValue = from.trim() || to.trim()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${
            hasValue ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          }`}
          title={`${label} filtern`}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-700">{label}</p>
          <div>
            <label className="text-xs text-gray-600">Von</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => onFromChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Bis</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {hasValue && (
            <Button
              variant="link"
              size="sm"
              className="h-6 p-0 text-xs text-gray-500"
              onClick={onReset}
            >
              Zurücksetzen
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SeasonFilterPopover({
  value,
  onChange,
  onReset,
}: {
  value: string
  onChange: (v: string) => void
  onReset: () => void
}) {
  const hasValue = value !== "all"
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 ${
            hasValue ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          }`}
          title="Saison filtern"
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-700">Saison</p>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle anzeigen</SelectItem>
              <SelectItem value="seasonal">Nur saisonal</SelectItem>
              <SelectItem value="günstig">Günstig (aktuell)</SelectItem>
              <SelectItem value="normal">Normal (aktuell)</SelectItem>
              <SelectItem value="teuer">Teuer (aktuell)</SelectItem>
            </SelectContent>
          </Select>
          {hasValue && (
            <Button
              variant="link"
              size="sm"
              className="h-6 p-0 text-xs text-gray-500"
              onClick={onReset}
            >
              Zurücksetzen
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ProductTableHeader({
  sort,
  sortDir,
  onSort,
  columnFilters,
  onFilterChange,
}: ProductTableHeaderProps) {
  const sh = (
    key: SortKey,
    label: string,
    cls: string,
    filterKey?: ColumnFilterKey
  ) => (
    <TableHead
      className={`whitespace-nowrap select-none hover:bg-gray-50 ${cls}`}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSort(key)}
          className="cursor-pointer flex items-center"
        >
          <span>{label}</span>
          <SortIcon active={sort === key} dir={sortDir} />
        </button>
        {filterKey && (
          <>
            {filterKey === "name" && (
              <TextFilterPopover
                label={label}
                value={
                  (columnFilters[filterKey]?.type === "text"
                    ? columnFilters[filterKey].value
                    : "") || ""
                }
                onChange={(v) =>
                  onFilterChange(filterKey, { type: "text", value: v })
                }
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
            {filterKey === "alias" && (
              <TextFilterPopover
                label={label}
                value={
                  (columnFilters[filterKey]?.type === "text"
                    ? columnFilters[filterKey].value
                    : "") || ""
                }
                onChange={(v) =>
                  onFilterChange(filterKey, { type: "text", value: v })
                }
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
            {filterKey === "frequency" && (
              <RangeFilterPopover
                label={label}
                unit=""
                min={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].min
                    : "") || ""
                }
                max={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].max
                    : "") || ""
                }
                onMinChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    min: v,
                  })
                }}
                onMaxChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    max: v,
                  })
                }}
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
            {filterKey === "last_price" && (
              <RangeFilterPopover
                label={label}
                unit="€"
                min={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].min
                    : "") || ""
                }
                max={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].max
                    : "") || ""
                }
                onMinChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    min: v,
                  })
                }}
                onMaxChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    max: v,
                  })
                }}
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
            {filterKey === "price_trend" && (
              <RangeFilterPopover
                label={label}
                unit="%"
                min={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].min
                    : "") || ""
                }
                max={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].max
                    : "") || ""
                }
                onMinChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    min: v,
                  })
                }}
                onMaxChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    max: v,
                  })
                }}
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
            {filterKey === "inflation_cagr" && (
              <RangeFilterPopover
                label={label}
                unit="%"
                min={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].min
                    : "") || ""
                }
                max={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].max
                    : "") || ""
                }
                onMinChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    min: v,
                  })
                }}
                onMaxChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    max: v,
                  })
                }}
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
            {filterKey === "last_purchase" && (
              <DateRangeFilterPopover
                label={label}
                from={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].min
                    : "") || ""
                }
                to={
                  (columnFilters[filterKey]?.type === "range"
                    ? columnFilters[filterKey].max
                    : "") || ""
                }
                onFromChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    min: v,
                  })
                }}
                onToChange={(v) => {
                  const current =
                    columnFilters[filterKey]?.type === "range"
                      ? columnFilters[filterKey]
                      : { type: "range" as const, min: "", max: "" }
                  onFilterChange(filterKey, {
                    ...current,
                    max: v,
                  })
                }}
                onReset={() => onFilterChange(filterKey, undefined)}
              />
            )}
          </>
        )}
      </div>
    </TableHead>
  )

  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        {sh("name", "Produkt", "min-w-[200px]", "name")}
        <TableHead className="hidden sm:table-cell whitespace-nowrap min-w-[180px]">
          <div className="flex items-center gap-1">
            <span>Alias</span>
            <TextFilterPopover
              label="Alias"
              value={
                (columnFilters.alias?.type === "text"
                  ? columnFilters.alias.value
                  : "") || ""
              }
              onChange={(v) =>
                onFilterChange("alias", { type: "text", value: v })
              }
              onReset={() => onFilterChange("alias", undefined)}
            />
          </div>
        </TableHead>
        {sh("frequency", "Käufe", "text-right min-w-[60px]", "frequency")}
        {sh(
          "last_price",
          "Letzter Preis",
          "text-right hidden sm:table-cell min-w-[100px]",
          "last_price"
        )}
        {sh(
          "price_trend",
          "Preistrend",
          "text-right hidden sm:table-cell min-w-[90px]",
          "price_trend"
        )}
        {sh(
          "inflation_cagr",
          "Ø Inflation p.a.",
          "text-right hidden md:table-cell min-w-[120px]",
          "inflation_cagr"
        )}
        {sh(
          "last_purchase",
          "Letzter Kauf",
          "text-right hidden md:table-cell min-w-[100px]",
          "last_purchase"
        )}
        <TableHead className="text-center hidden sm:table-cell whitespace-nowrap min-w-[80px]">
          <div className="flex items-center justify-center gap-1">
            <span>Saison</span>
            <SeasonFilterPopover
              value={
                (columnFilters.season?.type === "select"
                  ? columnFilters.season.value
                  : "") || "all"
              }
              onChange={(v) =>
                onFilterChange("season", { type: "select", value: v })
              }
              onReset={() => onFilterChange("season", undefined)}
            />
          </div>
        </TableHead>
        <TableHead className="text-center hidden sm:table-cell whitespace-nowrap min-w-[100px]">
          Statistiken
        </TableHead>
        <TableHead className="text-center whitespace-nowrap min-w-[50px]">
          Chart
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}

// ── Hauptkomponente ────────────────────────────────────────────────────────

export function ProductList() {
  const [data, setData] = useState<ProdukteResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [excludedSearch, setExcludedSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("frequency")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({})

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
  const [togglingSeasonalNames, setTogglingSeasonalNames] = useState<Set<string>>(new Set())

  const allProducts = useMemo(() => {
    const products = data?.products ?? []
    if (!CLIENT_SORT_KEYS.includes(sort)) return products
    return [...products].sort((a, b) => {
      const aVal = sort === "price_trend" ? a.price_trend_pct : a.inflation_cagr_pct
      const bVal = sort === "price_trend" ? b.price_trend_pct : b.inflation_cagr_pct
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      return sortDir === "desc" ? bVal - aVal : aVal - bVal
    })
  }, [data, sort, sortDir])

  const filteredProducts = useMemo(() => {
    return allProducts.filter(p => {
      const cf = columnFilters

      if (cf.name?.type === "text" && cf.name.value.trim()) {
        if (!p.raw_name.toLowerCase().includes(cf.name.value.toLowerCase())) return false
      }

      if (cf.alias?.type === "text" && cf.alias.value.trim()) {
        if (!(p.alias ?? "").toLowerCase().includes(cf.alias.value.toLowerCase())) return false
      }

      if (cf.frequency?.type === "range") {
        const { min, max } = cf.frequency
        if (min && Number(min) && p.purchase_count < Number(min)) return false
        if (max && Number(max) && p.purchase_count > Number(max)) return false
      }

      if (cf.last_price?.type === "range") {
        const { min, max } = cf.last_price
        const euros = p.last_price_cents / 100
        if (min && Number(min) && euros < Number(min)) return false
        if (max && Number(max) && euros > Number(max)) return false
      }

      if (cf.price_trend?.type === "range") {
        const { min, max } = cf.price_trend
        if (p.price_trend_pct == null) return false
        if (min && Number(min) && p.price_trend_pct < Number(min)) return false
        if (max && Number(max) && p.price_trend_pct > Number(max)) return false
      }

      if (cf.inflation_cagr?.type === "range") {
        const { min, max } = cf.inflation_cagr
        if (p.inflation_cagr_pct == null) return false
        if (min && Number(min) && p.inflation_cagr_pct < Number(min)) return false
        if (max && Number(max) && p.inflation_cagr_pct > Number(max)) return false
      }

      if (cf.last_purchase?.type === "range") {
        const { min, max } = cf.last_purchase
        if (min && p.last_purchase_date < min) return false
        if (max && p.last_purchase_date > max) return false
      }

      if (cf.season?.type === "select" && cf.season.value !== "all") {
        const v = cf.season.value
        if (v === "seasonal" && !p.seasonal) return false
        if ((v === "günstig" || v === "normal" || v === "teuer") && p.current_month_season !== v) return false
      }

      return true
    })
  }, [allProducts, columnFilters])

  const handleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc")
    } else {
      setSort(key)
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }

  const setFilter = (key: ColumnFilterKey, filter: ColumnFilter | undefined) => {
    setColumnFilters(prev =>
      filter ? { ...prev, [key]: filter } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
    )
  }

  const activeFilterCount = useMemo(() => {
    return Object.values(columnFilters).filter(f => {
      if (!f) return false
      if (f.type === "text") return f.value.trim() !== ""
      if (f.type === "select") return f.value !== "all"
      if (f.type === "range") return f.min.trim() !== "" || f.max.trim() !== ""
      return false
    }).length
  }, [columnFilters])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set("q", search.trim())
      if (!CLIENT_SORT_KEYS.includes(sort)) {
        params.set("sort", sort)
        params.set("dir", sortDir)
      }
      const res = await fetch(`/api/produkte?${params.toString()}`)
      if (!res.ok) throw new Error("Fehler beim Laden der Produkte")
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [search, sort, sortDir])

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

  const toggleSeasonal = async (product: Product) => {
    const newSeasonal = !product.seasonal

    // Optimistic update
    setTogglingSeasonalNames((prev) => new Set(prev).add(product.raw_name))
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        products: prev.products.map((p) =>
          p.raw_name === product.raw_name
            ? { ...p, seasonal: newSeasonal }
            : p
        ),
      }
    })

    try {
      const res = await fetch(
        `/api/produkte/${encodeURIComponent(product.raw_name)}/saison`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seasonal: newSeasonal }),
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
              ? { ...p, seasonal: !newSeasonal }
              : p
          ),
        }
      })
      setError("Status konnte nicht gespeichert werden")
    } finally {
      setTogglingSeasonalNames((prev) => {
        const next = new Set(prev)
        next.delete(product.raw_name)
        return next
      })
    }
  }

  const openChart = (rawName: string) => {
    setChartProduct(rawName)
    setChartOpen(true)
  }

  // Gemeinsame Props für ProductRow
  const rowProps = {
    editingName,
    editValue,
    saving,
    editInputRef,
    togglingNames,
    togglingSeasonalNames,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    onSaveAlias: saveAlias,
    onDeleteAlias: deleteAlias,
    onEditValueChange: setEditValue,
    onEditKeyDown: handleEditKeyDown,
    onToggleExclude: toggleExclude,
    onToggleSeasonal: toggleSeasonal,
    onOpenChart: openChart,
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

  const totalCount = data?.total_count ?? 0
  const excludedCount = data?.excluded_count ?? 0

  // Clientseitige Aufteilung in aktiv / ausgeblendet
  const activeProducts = filteredProducts.filter((p) => !p.excluded_from_stats)
  const excludedProducts = filteredProducts.filter((p) => p.excluded_from_stats)

  // Lokale Suche im Ausgeblendet-Tab (unabhängig von Haupt-Suche)
  const excludedSearchLower = excludedSearch.trim().toLowerCase()
  const filteredExcluded = excludedSearchLower
    ? excludedProducts.filter(
        (p) =>
          p.raw_name.toLowerCase().includes(excludedSearchLower) ||
          (p.alias ?? "").toLowerCase().includes(excludedSearchLower)
      )
    : excludedProducts

  // ── Empty state (noch keine Produkte) ─────────────────────────────────────
  if (totalCount === 0 && !search) {
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

      {/* Error banner (non-blocking) */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="produkte">
        <TabsList>
          <TabsTrigger value="produkte">Produkte</TabsTrigger>
          <TabsTrigger value="ausgeblendet">
            Ausgeblendet ({excludedCount})
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Aktive Produkte ─────────────────────────────────────── */}
        <TabsContent value="produkte">
          <div className="space-y-4 pt-2">
            {/* Search + Sort bar */}
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
              {activeFilterCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnFilters({})}
                  className="flex items-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  {activeFilterCount} Filter zurücksetzen
                </Button>
              )}
            </div>

            {/* Suche ohne Treffer */}
            {activeProducts.length === 0 && search && (
              <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
                <p className="text-gray-500">Kein Produkt für &ldquo;{search}&rdquo; gefunden.</p>
                <Button variant="link" size="sm" onClick={() => setSearch("")} className="mt-2">
                  Suche zurücksetzen
                </Button>
              </div>
            )}

            {/* Alle aktiven ausgeblendet */}
            {activeProducts.length === 0 && !search && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-10 text-center">
                <EyeOff className="h-8 w-8 text-amber-400 mx-auto mb-3" />
                <p className="text-amber-700 font-medium">Alle Produkte sind ausgeblendet.</p>
                <p className="text-amber-600 text-sm mt-1">
                  Wechsle zum Tab &ldquo;Ausgeblendet&rdquo;, um Produkte wieder einzublenden.
                </p>
              </div>
            )}

            {/* Produkttabelle */}
            {activeProducts.length > 0 && (
              <div className="rounded-lg border border-gray-100 bg-white overflow-x-auto">
                <Table className="w-full min-w-max">
                  <ProductTableHeader sort={sort} sortDir={sortDir} onSort={handleSort} columnFilters={columnFilters} onFilterChange={setFilter} />
                  <TableBody>
                    {activeProducts.map((product) => (
                      <ProductRow key={product.raw_name} product={product} {...rowProps} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Tab 2: Ausgeblendete Artikel ──────────────────────────────── */}
        <TabsContent value="ausgeblendet">
          <div className="space-y-4 pt-2">
            {/* Suche im Ausgeblendet-Tab */}
            {excludedProducts.length > 0 && (
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Ausgeblendete suchen…"
                  value={excludedSearch}
                  onChange={(e) => setExcludedSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}

            {/* Keine ausgeblendeten Artikel */}
            {excludedProducts.length === 0 && (
              <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
                <EyeOff className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Keine ausgeblendeten Artikel</p>
                <p className="text-gray-400 text-sm mt-1">
                  Blende Artikel über den Statistiken-Schalter in der Produktliste aus.
                </p>
              </div>
            )}

            {/* Suche ohne Treffer im Ausgeblendet-Tab */}
            {excludedProducts.length > 0 && filteredExcluded.length === 0 && excludedSearch && (
              <div className="rounded-lg border border-gray-100 bg-white p-10 text-center">
                <p className="text-gray-500">Kein ausgeblendetes Produkt für &ldquo;{excludedSearch}&rdquo; gefunden.</p>
                <Button variant="link" size="sm" onClick={() => setExcludedSearch("")} className="mt-2">
                  Suche zurücksetzen
                </Button>
              </div>
            )}

            {/* Ausgeblendet-Tabelle */}
            {filteredExcluded.length > 0 && (
              <div className="rounded-lg border border-gray-100 bg-white overflow-x-auto">
                <Table className="w-full min-w-max">
                  <ProductTableHeader sort={sort} sortDir={sortDir} onSort={handleSort} columnFilters={columnFilters} onFilterChange={setFilter} />
                  <TableBody>
                    {filteredExcluded.map((product) => (
                      <ProductRow key={product.raw_name} product={product} {...rowProps} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Price chart sheet */}
      <PriceChartSheet
        open={chartOpen}
        onOpenChange={setChartOpen}
        initialProduct={chartProduct}
      />
    </div>
  )
}
