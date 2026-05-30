# Context Map: PROJ-44 Personal Inflations-Index

**Created:** 2026-05-30  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
StatistikDashboard  (src/components/statistik-dashboard.tsx — bestehend)
+-- [existing cards: Monatsausgaben, Top-Produkte, Inflation, ...]
+-- PersonalInflationsIndexCard  (NEU — neue Card im Dashboard)
    +-- Headline: "Deine Lebensmittel-Inflation: X%" + Info-Tooltip
    +-- Delta-Badge: "X% über/unter offiziellem Wert" (grün/rot)
    +-- Period-Selector Dropdown (Kalenderjahr oder gleitende 12 Monate)
    +-- Kategorie-Filter Select (optional)
    +-- Sparkline: Mini-Balkendiagramm letzter 3 Jahresvergleiche
    +-- Warnhinweis wenn Datenbasis < 6 Monate
    +-- Empty state wenn nur 1 Jahr Daten vorhanden

ConfigDialog  (src/components/config-dialog.tsx — bestehend)
+-- [existing sections: Backup, Reset, ...]
+-- Neue Sektion "Lebensmittel-VPI Referenzwerte"
    +-- Tabelle: Jahr | Offizieller Wert (%) | [Bearbeiten]
    +-- Inline-Edit Input pro Jahr
    +-- Hinweistext: "Quelle: Destatis. Standardwerte vorausgefüllt."
```

### Data Model

**Neue DB-Tabelle `inflation_reference_values`:**
- `year` INTEGER — Primärschlüssel (z.B. 2024)
- `official_rate_percent` REAL — offizieller Destatis-Wert (z.B. 2.0), NULL wenn noch unbekannt
- Vorausgefüllte Seed-Werte: 2022 → 12.4, 2023 → 6.4, 2024 → 2.0, 2025 → null

**Berechnung (Laspeyres-Index) — nur gelesen, keine Änderungen:**
- `receipt_items.unit_price_cents` — Preis im Vorjahr vs. aktuell
- `receipt_items.quantity` — Menge (Basis-Warenkorb)
- `product_aliases.excluded_from_stats` — Pfand/Ausgeblendete raus
- `product_categories.category` — für Kategorie-Filter

### Tech Decisions

**Laspeyres-Index:** Der Vorjahres-Warenkorb (fixe Menge und Produkte) wird zu aktuellen Preisen bewertet. Vergleich mit Vorjahrespreisen ergibt den persönlichen Inflationswert. Einfache, etablierte Methode — leicht erklärbar (Info-Tooltip).

**Statische Referenzwerte (kein API-Call):** Destatis-VPI-Werte werden einmalig als Seed in DB gespeichert und im Config-Menü manuell pflegbar. Respektiert den "lokal-only"-Constraint.

**Periode-Auswahl:** Zwei Modi — Kalenderjahr (Jan–Dez) und gleitende 12 Monate (letzter Monat minus 12). Implementiert als Query-Parameter `mode=calendar|rolling`.

**Sparkline via Recharts:** Bereits in `statistik-dashboard.tsx` vorhanden — `BarChart` aus Recharts wird direkt genutzt, kein zusätzliches Package.

**Kategorie-Filter als separate API-Query:** Wenn Kategorie gesetzt, wird die Berechnung auf Produkte dieser Kategorie eingeschränkt. Gleiche Route, zusätzlicher `kategorie`-Parameter.

### Dependencies (packages to install)

_Keine neuen Packages erforderlich._

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** the files listed below.
> Do NOT scan the codebase independently.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | Neue Tabelle `inflation_reference_values` + Seed-Migration eintragen |
| `src/app/api/statistiken/inflations-index/route.ts` | Neu erstellen | GET: Berechnung persönlicher VPI vs. offizieller Wert |
| `src/app/api/statistiken/inflations-index/referenzwerte/route.ts` | Neu erstellen | GET + PUT: Referenzwerte lesen und aktualisieren |
| `src/components/statistik-dashboard.tsx` | Erweitern | `PersonalInflationsIndexCard` als neue Card einbinden |
| `src/components/config-dialog.tsx` | Erweitern | Neue Sektion für Referenzwert-Pflege hinzufügen |
| `src/app/api/statistiken/inflation/route.ts` | Nur lesen | Bestehende YoY-Inflationslogik als Vorlage — gleiche DB-Struktur |
| `src/app/api/statistiken/kategorien-inflation/route.ts` | Nur lesen | Kategorie-Filter-Muster für SQL-Query übernehmen |
| `src/app/api/produkte/categories/route.ts` | Nur lesen | Kategorie-Liste für den Kategorie-Filter-Dropdown |

### Kritische Typen & Interfaces

```typescript
// Antwort von GET /api/statistiken/inflations-index
interface InflationsIndexResponse {
  personal_rate: number | null      // Persönlicher VPI in % (z.B. 7.4)
  official_rate: number | null      // Offizieller Destatis-Wert in %
  delta: number | null              // personal_rate - official_rate
  basis_products_count: number      // Anzahl Produkte in Berechnung
  period_von: number                // Jahr/Startmonat
  period_bis: number                // Jahr/Endmonat
  warning: string | null            // z.B. "Datenbasis zu klein"
  sparkline: { period: string; personal_rate: number | null }[]  // letzte 3 Vergleiche
}

// Antwort von GET /api/statistiken/inflations-index/referenzwerte
interface ReferenzwertRow {
  year: number
  official_rate_percent: number | null
}

// PUT /api/statistiken/inflations-index/referenzwerte — Body
interface ReferenzwertUpdate {
  year: number
  official_rate_percent: number | null
}
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/avis/` — AVIS-Modul, unberührt
- `src/app/api/konto/` — Kontobewegungen, unberührt
- `src/app/api/bestellung/` — Bestellungen, unberührt
- `src/app/api/bons/` — Bon-Import, unberührt
- `src/app/api/export/` — Export, unberührt
- `src/components/ui/` — shadcn, keine Änderung
- `src/lib/parser/` — Parser, unberührt
- `src/app/api/statistiken/mwst/` — unberührt
- `src/app/api/statistiken/rabatte/` — unberührt

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `src/app/api/statistiken/kategorien-inflation.test.ts` | Unit | Ähnliche Aggregationslogik — Regression prüfen, Muster verstehen |
| `src/app/api/statistiken/einkaufskorb-vergleich/vorjahr.test.ts` | Unit | Jahresvergleichs-Muster — Regression prüfen |

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `src/app/api/statistiken/inflations-index.test.ts` | Unit | Laspeyres-Berechnung korrekt, leere DB → null, Warnhinweis bei < 6 Monaten, excluded_from_stats rausgefiltert, Kategorie-Filter |
| `tests/e2e/PROJ-44-personal-inflations-index.spec.ts` | E2E | Card sichtbar im Dashboard, Delta-Badge Farbe korrekt, Referenzwert im Config-Dialog editierbar |
