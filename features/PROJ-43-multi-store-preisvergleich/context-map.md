# Context Map: PROJ-43 Multi-Store-Preisvergleich

**Created:** 2026-05-29
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
/analyse?tab=multi-store
+-- AnalyseContent (erweitert: neuer Tab)
    +-- MultiStoreTab (Neu)
        +-- Tabelle: Alias | Günstigste Kette | Teuerste Kette | Δ% | Letzter Kauf
        +-- Sortierung nach Δ% (absteigend, Default)
        +-- Klick auf Zeile → öffnet PriceChartSheet für Produkt
        +-- EmptyState: "Nur eine Kette" Hinweis

PriceChartSheet (erweitert: neue Sektion)
+-- [bestehend: Preischart]
+-- MultiStoreProductSection (Neu, conditional)
    +-- Tabelle: Kette | Letzter Preis | Preis/Einheit | Letzter Kauf | Δ%
    +-- Günstigste Kette grün hervorgehoben
    +-- Veraltete Käufe (>6 Monate) ausgegraut + "(veraltet)"
    +-- ausgeblendet wenn nur 1 Kette
```

### Data Model

Keine neuen DB-Tabellen. Aggregation über bestehende Tabellen:

```
receipt_items JOIN receipts
  → GROUP BY COALESCE(pa.alias, ri.raw_name), r.store_chain
  → AVG(COALESCE(ri.price_per_unit_cents, ri.unit_price_cents))
  → MAX(r.receipt_date) as last_purchase
  → COALESCE(ri.normalized_unit, null) as unit

Filter: ri.item_type IN ('product', 'concession')
        ri.unit_price_cents > 0
        pa.excluded_from_stats = 0 (or NULL)
        r.receipt_date >= DATE('now', '-6 months') [Default-Filter für Übersicht]
```

### Tech Decisions

- **Kein neues npm-Paket:** Standard HTML-Tabelle mit shadcn Table-Komponente reicht aus.
- **Zwei API-Routen:** Eine für die Übersicht (alle Produkte), eine für Produktdetail (ein Alias) — die Detail-Route vermeidet das Laden aller Daten in die PriceChartSheet.
- **Server-seitig aggregieren:** SQLite GROUP BY ist effizienter als Client-seitige Aggregation über Roh-Datenpunkte.
- **Fallback auf unit_price_cents:** PROJ-39 hat nicht für alle Items normalized units. Fallback ist notwendig mit Kennzeichnung "(Stückpreis)".
- **is_stale-Flag:** Kauf >6 Monate alt wird in der API berechnet und als boolean übergeben — Client entscheidet nur über Darstellung.

### Dependencies
Keine neuen Pakete.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** the files listed below. Do NOT scan the codebase independently.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/statistiken/multi-store/route.ts` | Neu erstellen | API für Multi-Store-Übersicht |
| `src/app/api/produkte/[name]/multi-store/route.ts` | Neu erstellen | API für Produktdetail-Sektion |
| `src/components/multi-store-tab.tsx` | Neu erstellen | Neue Tab-Komponente für /analyse |
| `src/components/multi-store-product-section.tsx` | Neu erstellen | Sektion in PriceChartSheet |
| `src/components/analyse-content.tsx` | Erweitern | Neuen Tab "Multi-Store" hinzufügen |
| `src/components/price-chart-sheet.tsx` | Erweitern | MultiStoreProductSection einbinden |
| `src/lib/db.ts` | Nur lesen | Schema: receipt_items, receipts, product_aliases |
| `src/app/api/statistiken/kategorien-inflation/route.ts` | Nur lesen | Muster für CTE-Aggregation mit JOIN auf aliases + categories |
| `src/lib/format.ts` | Nur lesen | formatEuro, formatDate — wiederverwenden |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// API Response: GET /api/statistiken/multi-store
interface MultiStoreChain {
  chain: string                        // 'rewe' | 'lidl' | 'kaufland' | 'edeka' | 'sonstige'
  avg_price_cents: number              // AVG(COALESCE(price_per_unit_cents, unit_price_cents))
  normalized_unit: string | null       // 'g' | 'ml' | 'Stück' | null
  last_purchase_date: string           // YYYY-MM-DD
  is_stale: boolean                    // last_purchase_date < DATE('now', '-6 months')
  is_normalized: boolean               // true wenn price_per_unit_cents verwendet
}

interface MultiStoreItem {
  alias: string
  chains: MultiStoreChain[]
  cheapest_chain: string
  priciest_chain: string
  delta_pct: number                    // (priciest - cheapest) / cheapest * 100
}

interface MultiStoreResponse {
  items: MultiStoreItem[]
  only_one_chain: boolean              // true → EmptyState anzeigen
  dominant_chain?: string              // z.B. 'rewe' — für EmptyState-Meldung
}

// API Response: GET /api/produkte/[name]/multi-store
// Gibt MultiStoreItem | null zurück (null wenn nur 1 Kette)
interface ProductMultiStoreResponse {
  item: MultiStoreItem | null
}

// Aus price-chart-sheet.tsx — PriceChartSheet Props (bestehend, zum Nachlesen)
interface PriceData {
  raw_name: string
  alias: string | null
  preise: PricePoint[]
}
interface PricePoint {
  datum: string
  zeit: string
  einzelpreis_cents: number
  rabatt_cents: number
  bon_nr: string
  markt: string
}

// Chain label helper (aus src/lib/chain.ts falls vorhanden, sonst inline)
const CHAIN_LABELS: Record<string, string> = {
  rewe: 'REWE', lidl: 'Lidl', kaufland: 'Kaufland',
  edeka: 'EDEKA', sonstige: 'Sonstige'
}
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/konto/` — Kontoauszug-Modul, unberührt
- `src/app/api/avis/` — AVIS-Matching, unberührt
- `src/app/api/import/` — Import-Logik, unberührt
- `src/components/statistik-dashboard.tsx` — bestehende Cards, nicht geändert
- `src/components/bon-list.tsx` — Bon-Übersicht, unberührt
- `src/app/einstellungen/` — Einstellungen, unberührt

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `tests/PROJ-48-navigations-konsolidierung.spec.ts` (falls vorhanden) | E2E | Analyse-Tab-Navigation könnte betroffen sein |

> Falls die Datei nicht existiert: keine bestehenden Tests betroffen.

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/e2e/PROJ-43-multi-store.spec.ts` | E2E | Tab sichtbar; EmptyState wenn nur 1 Kette; Tabelle mit Daten zeigt Δ%; Klick → PriceChartSheet öffnet |
| `src/app/api/statistiken/multi-store/route.test.ts` | Unit | Aggregation korrekt; Fallback auf unit_price; is_stale-Flag; delta_pct-Berechnung |
