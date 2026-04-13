# Context Map: PROJ-11 – Preistrend letzte 12 Monate

**Created:** 2026-04-12
**Architect:** Solution Architect (AI)
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
ProductList (src/components/product-list.tsx)
└── PriceTrendBadge                      ← bestehend, 2 neue Props
    └── TooltipProvider (shadcn/ui)      ← NEU: wraps Badge
        └── Tooltip
            └── TooltipTrigger           ← Badge selbst
            └── TooltipContent           ← "Apr 2025 – Apr 2026"
```

### Data Model

Keine Datenbankänderung. Nur die API-Antwort wird erweitert:

```
Product (API-Antwort) hat neu:
- trend_from_date: ISO-Datum (string) oder null
    → Datum des ältesten Kaufs im 12-Monats-Fenster
    → null wenn < 2 Käufe im Fenster oder letzter Kauf > 12 Monate her
- trend_to_date: ISO-Datum (string) oder null
    → Datum des neuesten Kaufs im 12-Monats-Fenster

Bestehende Felder ändern ihre Bedeutung (nicht ihren Namen):
- first_price_cents → jetzt: erster Preis im 12-Monats-Fenster (nicht mehr "aller Zeiten")
- price_trend_pct   → jetzt: Veränderung innerhalb 12 Monate (oder null wenn inaktiv/< 2 Käufe)
```

### Tech Decisions

**12-Monats-Filter in SQLite-Subquery:** Beide Subqueries (first/last price) bekommen eine `WHERE receipt_date >= DATE('now', '-12 months')` Bedingung. Die Inaktiv-Regel (letzter Kauf > 12 Monate → kein Badge) ergibt sich automatisch daraus: wenn kein Kauf im Fenster → null.

**price_data_count zählt jetzt im 12-Monats-Fenster:** Nur wenn ≥ 2 Käufe (mit Preis > 0) innerhalb von 12 Monaten existieren, wird `price_trend_pct` berechnet.

**Tooltip statt separatem Text:** Der Zeitraum ist sekundäre Information – ein shadcn Tooltip am Badge ist die platzsparendste Lösung. `Tooltip` ist bereits installiert.

**Kein Breaking Change:** Alle neuen Felder sind additiv. `first_price_cents` bleibt im Interface (ändert nur Semantik), das Frontend nutzt es nicht direkt (nur für Badge).

### Dependencies

Keine neuen Packages. `Tooltip` ist unter `src/components/ui/tooltip.tsx` verfügbar.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) lesen **NUR** die unten gelisteten Dateien.
> Kein eigenständiges Codebase-Scanning.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/produkte/route.ts` | Erweitern | 12-Monats-Filter in Subqueries + neue Felder trend_from_date / trend_to_date |
| `src/components/product-list.tsx` | Erweitern | Product-Interface + PriceTrendBadge bekommt Tooltip |
| `src/components/ui/tooltip.tsx` | Nur lesen | shadcn Tooltip – bereits installiert, Referenz für Import |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// Aktuelles Product-Interface in src/components/product-list.tsx (Zeilen 22–31)
interface Product {
  raw_name: string
  alias: string | null
  purchase_count: number
  first_price_cents: number | null   // NEU: Bedeutung = erster Preis in 12 Monaten
  last_price_cents: number
  price_trend_pct: number | null     // NEU: Trend über 12-Monats-Fenster
  last_purchase_date: string
  excluded_from_stats: boolean
  // NEU hinzufügen:
  trend_from_date: string | null     // ISO-Datum "YYYY-MM-DD", erster Kauf im Fenster
  trend_to_date: string | null       // ISO-Datum "YYYY-MM-DD", letzter Kauf im Fenster
}

// Aktuelles PriceTrendBadge in src/components/product-list.tsx (Zeilen 54–78)
// Props müssen erweitert werden:
// { pct: number | null; fromDate: string | null; toDate: string | null; onClick: () => void }

// ProdukteResponse bleibt unverändert:
interface ProdukteResponse {
  products: Product[]
  total_count: number
  excluded_count: number
}
```

### API-Änderung (für Backend-Agent)

Aktuell berechnet die Route in `src/app/api/produkte/route.ts`:

- `first_price_cents`: Subquery ohne Datumsfilter (`ORDER BY r2.receipt_date ASC LIMIT 1`)
- `price_data_count`: Zählt alle Käufe mit Preis > 0

**Zu ändern:**
1. `first_price_cents`-Subquery: zusätzliche Bedingung `AND r2.receipt_date >= DATE('now', '-12 months')`
2. `price_data_count`-Subquery: gleiches Datumsfilter
3. Neue Subquery `trend_from_date`: Datum des ältesten Kaufs im 12-Monats-Fenster (mit Preis > 0)
4. Neue Subquery `trend_to_date`: Datum des neuesten Kaufs im 12-Monats-Fenster
5. `last_price_cents`-Subquery bekommt ebenfalls den 12-Monats-Filter, damit auch der "letzte Preis" aus dem Fenster kommt
6. Normalisierungs-Logik (Zeilen 88–105): `price_trend_pct` bleibt gleich, `trend_from_date`/`trend_to_date` werden durchgereicht

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/produkte/[name]/` — Subrouten für Alias/Exclude/Preisentwicklung – unberührt
- `src/components/price-chart-sheet.tsx` — Chart-Komponente – unberührt
- `src/components/bon-list.tsx`, `src/components/bon-detail.tsx` — unberührt
- `src/app/api/bons/`, `src/app/api/statistiken/`, `src/app/api/import/` — andere Domains
- `src/components/statistik-dashboard.tsx` — unberührt
