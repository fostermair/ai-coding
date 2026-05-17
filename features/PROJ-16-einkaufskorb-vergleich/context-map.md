# Context Map: PROJ-16 Einkaufskorb-Vergleich

**Created:** 2026-05-17  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

Das Feature erweitert das bestehende **Statistik-Dashboard** um zwei neue Vergleichs-Karten:

```
Statistik-Dashboard (src/app/statistiken/page.tsx)
+-- StatistikDashboard component (src/components/statistik-dashboard.tsx)
    +-- Zeitraum-Filter (3M / 6M / 12M / Alle) — existierend
    +-- Karten in Grid-Layout:
        +-- Monatliche Ausgaben Card — existierend
        +-- Top-10 Produkte Card — existierend
        +-- Rabatte Card — existierend
        +-- MwSt Breakdown Card — existierend
        +-- NEW: Einkaufskorb-Vergleich Card(s)
            +-- Vorjahres-Vergleich Sub-Card (letzte Einkauf vs. ~1 Jahr zuvor)
            +-- Voreinkauf-Vergleich Sub-Card (letzter Einkauf vs. vorheriger)
            +-- Jeweils: Differenz (EUR + %), Farbcodierung, Produkt-Anzahl, Empty State
```

### Data Model

**Einkaufskorb-Vergleich-Result (von API zurückgegeben):**

```
- kann_vergleichen: boolean
  Die App hat genug Daten, um einen Vergleich zu zeigen
  
- wenn kann_vergleichen = false:
  - reason: string ("Nur ein Einkauf vorhanden", "Keine Vorjahresdaten verfügbar")

- wenn kann_vergleichen = true:
  - letzter_einkauf:
    - datum: string ("2026-05-17")
    - gesamt_cents: number (total of matching products)
  
  - vergleich:
    - datum: string ("2025-05-15" für Vorjahr, oder Datum vorheriger Einkauf)
    - typ: string ("vorjahr" oder "voreinkauf")
    - gesamt_cents: number
  
  - vergleich_stats:
    - differenz_cents: number (negative = günstiger, positive = teurer)
    - differenz_prozent: number (kann negativ sein)
    - produkte_gezaehlt: number (wie viele Produkte im Vergleich)
    - produkte_gesamt: number (wie viele Produkte im letzten Einkauf)
```

**Speicherort:** SQLite-Datenbank (bereits vorhanden)
- `receipts` Tabelle: receipt_id, receipt_date, total_amount_cents
- `receipt_items` Tabelle: receipt_id, raw_name, unit_price_cents, total_price_cents
- `product_aliases` Tabelle: raw_name, excluded_from_stats (Ausfilterung)

### Tech Decisions

**1. Zwei getrennte API-Routen**
- `/api/statistiken/einkaufskorb-vergleich/vorjahr`
- `/api/statistiken/einkaufskorb-vergleich/voreinkauf`

**Begründung:** Jede Route hat unterschiedliche Logik (Datumsfenster vs. Sequenz-Suche). Separate Routes ermöglichen unabhängiges Testen und zukünftige Erweiterung (z.B. optional separate Query-Parameter).

**2. Serverseitige Berechnung**
Alle Vergleiche erfolgen in der API, nicht im Frontend. Das Frontend empfängt fertige Metriken.

**Begründung:** Performance (<300ms), Komplexität der Joins, Ausschluss-Logik für ausgeblendete Produkte.

**3. Keine neuen Abhängigkeiten**
Nutzen bestehende Libraries:
- shadcn/ui Card, Badge, Alert
- SQLite mit better-sqlite3 (bereits used)
- React Hooks (useState, useEffect) für Daten-Fetch

**Begründung:** Minimale Komplexität, Konsistenz mit bestehendem Codebase.

**4. UI-Pattern**
Zwei Sub-Cards / Tabs oder zwei separate Metriken in einer Card, ähnlich wie die "Inflation" Tab in der Top-Produkte Card.

**Begründung:** Nutzt bestehende Pattern vom Dashboard, spart Platz.

### Dependencies (packages to install)

- Keine neuen Abhängigkeiten erforderlich. Alle Tools sind bereits installiert.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) lesen **NUR** die Dateien in dieser Liste.
> Keine unabhängigen Codebase-Scans.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/statistik-dashboard.tsx` | Erweitern | Neue API-Calls hinzufügen (`/einkaufskorb-vergleich/vorjahr` & `/voreinkauf`), State & UI für zwei neue Metriken |
| `src/app/api/statistiken/einkaufskorb-vergleich/vorjahr/route.ts` | Neu erstellen | API Endpoint für Jahresvergleich |
| `src/app/api/statistiken/einkaufskorb-vergleich/voreinkauf/route.ts` | Neu erstellen | API Endpoint für Voreinkauf-Vergleich |
| `src/lib/db.ts` | Nur lesen | DB-Client (`getDb()`), Schema-Referenz (receipts, receipt_items, product_aliases) |
| `src/app/statistiken/page.tsx` | Nur lesen | Dashboard-Page, zeigt StatistikDashboard Komponente (keine Änderungen nötig) |
| `src/components/ui/card.tsx` | Nur lesen | shadcn Card Komponente (wird nur verwendet, nicht erweitert) |
| `src/components/ui/badge.tsx` | Nur lesen | shadcn Badge Komponente (für Farb-Codierung) |
| `src/components/ui/alert.tsx` | Nur lesen | shadcn Alert Komponente (für Empty-State Hinweise) |

**Legende:** Nur lesen (Referenz) · Erweitern (Modifikation) · Neu erstellen (neuer File)

### Kritische Typen & Interfaces

```typescript
// Response von /api/statistiken/einkaufskorb-vergleich/vorjahr & /voreinkauf
interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string // "Nur ein Einkauf vorhanden" | "Keine Vorjahresdaten verfügbar"
  
  letzter_einkauf: {
    datum: string // YYYY-MM-DD
    gesamt_cents: number
  }
  
  vergleich: {
    datum: string
    typ: "vorjahr" | "voreinkauf" // je nach API-Route
    gesamt_cents: number
  }
  
  vergleich_stats: {
    differenz_cents: number
    differenz_prozent: number
    produkte_gezaehlt: number // wie viele Produkte im Vergleich
    produkte_gesamt: number // wie viele Produkte im letzten Einkauf
  }
}

// State in StatistikDashboard.tsx
interface EinkaufsverbgleichData {
  vorjahr: EinkaufsverbgleichResponse | null
  voreinkauf: EinkaufsverbgleichResponse | null
}
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/components/product-list.tsx` — Produktlisten-Komponente (unabhängig)
- `src/components/bon-list.tsx` — Bon-Übersicht (unabhängig)
- `src/components/price-chart-sheet.tsx` — Preis-Chart (PROJ-4, unabhängig)
- `src/app/api/produkte/` — andere Produktendpoints (unabhängig)
- `src/app/api/bons/` — Bon-Endpoints (unabhängig)
- `src/components/ui/` — alle anderen shadcn Komponenten außer Card, Badge, Alert

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `tests/e2e-statistik-dashboard.spec.ts` (falls vorhanden) | E2E | Dashboard-E2E Tests müssen evtl. auf neue Karten angepasst werden |

**Hinweis:** Falls keine bestehenden Tests vorhanden sind, keine Änderungen erforderlich.

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `src/app/api/statistiken/einkaufskorb-vergleich/vorjahr.test.ts` | Unit / Integration | Test: Korrekte Jahres-Fenster-Berechnung (±30 Tage), Ausfilterung excluded Produkte, Empty-State wenn keine Daten |
| `src/app/api/statistiken/einkaufskorb-vergleich/voreinkauf.test.ts` | Unit / Integration | Test: Korrekte vorheriger Einkauf-Suche, Produktmatching, Empty-State |
| `tests/PROJ-16-einkaufskorb-vergleich.spec.ts` | E2E | Einer `test()` pro Acceptance Criterion: (1) Vorjahres-Vergleich zeigt EUR & %, (2) Voreinkauf-Vergleich zeigt EUR & %, (3) Produkt-Zähler, (4) Empty States |

---

## Hinweise für Downstream Agents

1. **Backend (API Routes):**
   - Nutzen `getDb()` aus `src/lib/db.ts`
   - Berücksichtigen `product_aliases.excluded_from_stats` Flag (Ausblendung aus Statistiken)
   - Nutzen `unit_price_cents` (tatsächlich bezahlter Preis, nicht rabattiert)
   - Performance-Ziel: <300ms per Route

2. **Frontend (Dashboard):**
   - Muster folgen von bestehenden Karten (MonatlichCard, TopProdukteCard, etc.)
   - Farb-Codierung: rot (teurer), grün (günstiger)
   - Empty States behandeln: wenn `kann_vergleichen = false`, Hinweis-Alert zeigen

3. **QA:**
   - Test mit Daten, die mehrere Jahre umfassen (für Jahresvergleich)
   - Edge Cases prüfen: nur 1 Einkauf, keine gemeinsamen Produkte, Rabatte bei Produkten
