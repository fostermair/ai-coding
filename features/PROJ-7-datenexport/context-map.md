# PROJ-7: Datenexport (Excel & CSV) – Context Map

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/bon/page.tsx` | Erweitern | Export-Button auf Bon-Übersichtsseite hinzufügen |
| `src/app/statistiken/page.tsx` | Erweitern | Export-Button auf Statistik-Dashboard hinzufügen |
| `src/app/api/bons/route.ts` | Nur lesen | GET-Logik für Bon-Daten (Struktur verstehen) |
| `src/app/api/export/csv/route.ts` | Neu erstellen | CSV-Export Endpoint |
| `src/app/api/export/xlsx/route.ts` | Neu erstellen | Excel-Export Endpoint |
| `src/components/export-dialog.tsx` | Neu erstellen | Export-Dialog mit Datums-Filter und Alias-Option |
| `src/lib/db.ts` | Nur lesen | SQLite DB-Client und Query-Wrapper |
| `src/lib/format.ts` | Nur lesen | Formatierungs-Utilities (formatEuro, etc.) |
| `src/app/api/produkte/route.ts` | Nur lesen | Produkt-API für Alias-Daten |

## Kritische Typen & Interfaces

### Receipt Data Structure
```typescript
interface ReceiptItem {
  receipt_id: string
  item_type: string // "product", "concession", "discount", "payment", etc.
  raw_name: string
  menge: number
  unit_price_cents: number
  total_price_cents: number
  tax_code: string // "A" = 7%, "B" = 19%
}

interface Receipt {
  id: string
  receipt_date: string // ISO date
  receipt_time: string // HH:MM:SS
  markt: string // Store name
  receipt_number: string
  total_amount_cents: number
}

interface ProductAlias {
  raw_name: string
  alias: string | null
  excluded_from_stats: boolean
}
```

### Export Request/Response Types
```typescript
interface ExportQuery {
  from?: string // ISO date (optional, default null = all)
  to?: string   // ISO date (optional, default null = all)
  useAlias?: boolean // default true = use alias, false = use raw_name
}

interface ExportLine {
  datum: string
  uhrzeit: string
  markt: string
  bon_nr: string
  produktname: string // Either alias or raw_name
  menge: number
  einzelpreis: string // formatted as "1,99" (comma decimal)
  gesamtpreis: string // formatted as "5,97" (comma decimal)
  mwst_code: string // "A" or "B"
  rabatt: string // "Ja" or "Nein"
  rabatt_betrag: string // formatted, "" if no discount
}
```

## High-Level Architecture

### Component Structure (Visual)
```
Bon-Seite & Statistik-Dashboard
├── Export-Button (neu)
│   └── ExportDialog (neu)
│       ├── Von-Datum Input (optional)
│       ├── Bis-Datum Input (optional)
│       ├── Checkbox: "Alias-Namen verwenden" (default: checked)
│       └── Buttons: Export CSV | Export Excel | Abbrechen

API Endpoints (neu)
├── GET /api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD
│   └── Response: CSV File (Content-Disposition: attachment)
└── GET /api/export/xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD
    └── Response: Excel File (Content-Disposition: attachment)
```

### Data Flow
1. **Nutzer klickt Export-Button** → ExportDialog öffnet sich
2. **Nutzer wählt Zeitraum + Optionen** → Dialog sendet API-Request (CSV oder XLSX)
3. **API sammelt Daten:**
   - Abfrage: `receipts` + `receipt_items` (filtered by date)
   - Join: `product_aliases` für Alias-Namen
   - Aggregation: Top-20 häufigste Produkte (für Excel)
4. **API generiert Datei:**
   - CSV: Native String-Generierung (mit Komma-Dezimaltrennzeichen, UTF-8 BOM)
   - Excel: exceljs-Library (3 Sheets: Positionen, Bon-Übersicht, Top-20)
5. **Browser downloaded Datei** (Content-Disposition: attachment)

### Data Sources
- **SQLite Tabellen:** `receipts`, `receipt_items`, `item_discounts`, `product_aliases`
- **Filter:** `receipt_date` zwischen `from` und `to` (beide optional)
- **Produktnamen:** `product_aliases.alias` falls vorhanden, sonst `receipt_items.raw_name`
- **Preisformatierung:** Cents → EUR mit Komma-Dezimaltrennzeichen (1234 cents = "12,34")

## Tech Decisions (bereits spezifiziert)

| Entscheidung | Warum |
|---|---|
| **2 separate APIs (CSV + Excel)** | Unterschiedliche Header-Types und Generierungslogik. Client wählt welche anzufordern. |
| **CSV mit UTF-8 BOM** | Excel öffnet UTF-8 automatisch falsch ohne BOM → BOM sorgt für Kompatibilität. |
| **Dezimaltrennzeichen: Komma** | Deutsche Lokalisation (REWE ist deutsch). Nutzer erwartet "1,99" nicht "1.99". |
| **CSV ohne externe Library** | Native Node.js String-Generierung ist einfach und schnell. |
| **exceljs für Excel** | Gut dokumentiert, unterstützt Formatierung (fett, Spaltenbreiten), Mehrere Sheets. |
| **Filter via Query-Params** | RESTful API-Design, einfach zu testen, cachebar (optional). |
| **Download als attachment** | `Content-Disposition: attachment` zwingt Browser zu speichern, nicht zu rendern. |
| **3 Excel-Sheets** | Nutzer kann zwischen Detailansicht (Positionen), Übersicht (Bons) und KPIs (Top-20) wechseln. |

## Dependencies

| Paket | Version | Nutzen |
|-------|---------|--------|
| `exceljs` | ^4.x | Excel-Generierung mit Formatierung + mehreren Sheets |
| (Node.js built-in) | — | CSV String-Generierung (kein Paket nötig) |

**Zu installieren:** `npm install exceljs`

## API Endpoints (neu)

| Endpunkt | Methode | Query-Params | Response | Zweck |
|----------|---------|--------------|----------|--------|
| `/api/export/csv` | GET | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | CSV File (text/csv) | Export aller Positionen als CSV |
| `/api/export/xlsx` | GET | `?from=YYYY-MM-DD&to=YYYY-MM-DD` | Excel File (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet) | Export mit 3 Sheets |

**Query-Parameter (beide optional):**
- `from` — ISO date, Start-Datum (default: null = anfang aller Daten)
- `to` — ISO date, End-Datum (default: null = Ende aller Daten)
- `useAlias` — boolean, Alias-Namen verwenden (default: true)

**Error Responses:**
- 400 Bad Request — Ungültiges Datumsformat
- 500 Internal Server Error — DB-Fehler oder zu große Datenmenge (>30s Timeout)

## Nicht-Lesen-Liste

Diese Dateien sind NICHT relevant:
- `src/app/import/` — eBon-Import (separate Feature)
- `src/app/produkte/` — Produkt-Liste (separate Feature)
- `src/app/api/paperless/` — Paperless-Integration (separate Feature)
- Tests für andere Features (PROJ-1, PROJ-9, etc.)

## Tests

### Bestehende Tests (Regression prüfen)

| Datei | Typ | Aktion | Warum relevant |
|-------|-----|--------|---|
| `src/lib/format.test.ts` | Unit | Regression prüfen | Export nutzt `formatEuro()` nicht direkt, aber ähnliche Formatierungslogik |
| `src/app/api/bons/route.ts` (kein Test vorhanden) | — | — | Keine Tests → keine Regression |

### Neue Tests (erstellen)

| Datei | Typ | Was testen |
|-------|-----|-----------|
| `src/app/api/export/csv.test.ts` | Unit/Integration | CSV-Generierung: Encoding, Dezimaltrennzeichen, Komma-Escaping, Dateiheader |
| `src/app/api/export/xlsx.test.ts` | Unit/Integration | Excel-Generierung: 3 Sheets, Header-Formatierung, Spaltenbreiten, Zahlenformat |
| `tests/PROJ-7-export.spec.ts` | E2E (Playwright) | UI: Export-Dialog, Datums-Filter, Download funktioniert |

**Test-Abdeckung:**
- ✅ Happy path: gültiger Export mit Daten
- ✅ Edge case: keine Daten vorhanden → leere Datei mit Header
- ✅ Edge case: große Datenmenge (100+ Positionen) → kein Timeout
- ✅ Edge case: Produktname mit Komma (CSV) → korrekt escaped
- ✅ Validation: ungültiges Datumsformat → 400 Error
- ✅ Dateiname korrekt: `ebon-export-YYYY-MM-DD.csv|xlsx`

## Feature Status
- **Status:** Planned (nach Migration) → nach Architect: Architected
- **Frontend:** UI-Komponenten (Button + Dialog) — noch nicht implementiert
- **Backend:** 2 API-Endpunkte (CSV + Excel) — noch nicht implementiert
- **Tests:** 3 Test-Dateien (noch nicht implementiert)
- **Nächster Schritt:** `/frontend` für UI-Dialog, dann `/backend` für APIs

---
*Diese Context Map wurde während der Architektur-Phase erstellt. Sie führt Downstream-Agents (Frontend, Backend, QA) durch das Feature mit minimalem zusätzlichem Kontext.*
