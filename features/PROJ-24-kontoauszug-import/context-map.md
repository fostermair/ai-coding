# Context Map: PROJ-24 — Kontoauszug-Import & Parser

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | Neue Tabellen `bank_transactions` + `bank_statement_log` via Migration-Pattern |
| `src/lib/parser/konto.ts` | Neu erstellen | PDF-Text-Extraktion + N3/Volksbank-Parser (2-Zeilen-Format) |
| `src/app/api/konto/import/route.ts` | Neu erstellen | FormData POST: PDF empfangen, parsen, DB speichern, Duplikat-Check |
| `src/app/api/konto/paperless-sync/route.ts` | Neu erstellen | Paperless-Sync via `PAPERLESS_KONTO_DOCUMENT_TYPE_ID`, analog zu `src/app/api/paperless/sync/route.ts` |
| `src/components/import-zone.tsx` | Erweitern | 3. Upload-Zone für Kontoauszüge + Paperless-Konto-Sync-Button |
| `src/app/api/import/route.ts` | Nur lesen | PDF-Polyfill-Pattern (Zeilen 1–41), Transaktion-Pattern, logImport-Funktion |
| `src/app/api/paperless/sync/route.ts` | Nur lesen | Paginierungs-Logik, Auth-Header-Pattern, Paperless API-Struktur |
| `src/lib/parser/rewe.ts` | Nur lesen | Parser-Struktur als Vorlage (exported function + typed return) |

## Kritische Typen & Interfaces

### Parser-Output (`src/lib/parser/konto.ts`)
```typescript
export interface KontoBankTransaction {
  buchungsdatum: string       // YYYY-MM-DD
  valutadatum: string         // YYYY-MM-DD
  typ: 'kartenzahlung' | 'überweisung' | 'gutschrift' | 'sonstige'
  beschreibung: string        // Rohtext
  haendler_name: string | null
  empfaenger_name: string | null
  verwendungszweck: string | null
  iban: string | null
  bic: string | null
  betrag_cents: number        // negativ = Ausgabe
}

export interface ParsedKontoauszug {
  konto_iban: string
  periode: string             // YYYY-MM
  kontoinhaber: string
  transactions: KontoBankTransaction[]
  parseErrors: string[]
}
```

### API Response: `POST /api/konto/import`
```typescript
interface KontoImportResult {
  imported: number
  duplicates: number
  errors: number
  periode: string             // YYYY-MM
  status: 'success' | 'duplicate' | 'error'
  message?: string
}
```

### DB-Row: `bank_transactions`
```typescript
interface BankTransactionRow {
  id: number
  buchungsdatum: string
  valutadatum: string
  typ: string
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  verwendungszweck: string | null
  iban: string | null
  bic: string | null
  betrag_cents: number
  kontoauszug_datei: string | null
  periode: string
  konto_iban: string
  importiert_am: string
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
}
```

## DB-Schema (neu in `src/lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buchungsdatum TEXT NOT NULL,
  valutadatum TEXT,
  typ TEXT NOT NULL,
  beschreibung TEXT NOT NULL,
  haendler_name TEXT,
  empfaenger_name TEXT,
  verwendungszweck TEXT,
  iban TEXT,
  bic TEXT,
  betrag_cents INTEGER NOT NULL,
  kontoauszug_datei TEXT,
  periode TEXT NOT NULL,
  konto_iban TEXT NOT NULL,
  importiert_am TEXT NOT NULL DEFAULT (datetime('now')),
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  matched_receipt_id INTEGER REFERENCES receipts(id),
  match_source TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_unique
  ON bank_transactions(konto_iban, buchungsdatum, betrag_cents, beschreibung);

CREATE TABLE IF NOT EXISTS bank_statement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  konto_iban TEXT NOT NULL,
  periode TEXT NOT NULL,
  dateiname TEXT,
  importiert_am TEXT NOT NULL DEFAULT (datetime('now')),
  transaktion_count INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_stmt_unique
  ON bank_statement_log(konto_iban, periode);
```

Migration in `initSchema()` — direkt nach bestehenden `CREATE TABLE IF NOT EXISTS`-Blöcken einfügen (kein ALTER TABLE nötig, neue Tabellen).

## Env Vars (`.env.local`)

```
PAPERLESS_KONTO_DOCUMENT_TYPE_ID=3
```

Schon vorhandene Vars (für Paperless-Basis-Auth) werden mitverwendet:
```
PAPERLESS_URL=...
PAPERLESS_TOKEN=...
```

## Parser-Logik (konto.ts)

**Bankformat N3/Volksbank:**
- Header: Zeile mit `IBAN` → `konto_iban`; Zeile mit `Vorläufiger Kontoauszug MM/YYYY` → `periode` (YYYY-MM)
- Transaktionen: 2-Zeilen-Blöcke
  - Zeile 1: `DD.MM.  DD.MM.  Typ Beschreibung  -49,08 €`
  - Zeile 2: Zusatzinfo (IBAN/BIC bei Überweisung, Adresse bei Kartenzahlung)
- Datum + Jahr: Jahr aus `periode`, Dezember→Januar-Überlauf: wenn Monat > Periode-Monat → Jahr+1
- Betrag: `"-49,08 €"` → replace(`.`,``).replace(`,`,`.`) → parseInt → Cent-Wert
- Typ-Mapping: `Kartenzahlung` → `kartenzahlung`; `Echtzeitüberweisung`|`Überweisung` → `überweisung`; positiver Betrag → `gutschrift`; unbekannt → `sonstige`

## Import-Route Muster (analog zu `src/app/api/import/route.ts`)

1. PDF-Polyfills einfügen (DOMMatrix, ImageData, Path2D) — 1:1 aus import/route.ts
2. FormData empfangen, ArrayBuffer → pdfjs
3. `parseKontoauszug(text)` aufrufen
4. `bank_statement_log` auf Duplikat prüfen (UNIQUE-Constraint)
5. Transaktionen in Schleife per `INSERT OR IGNORE` einfügen (einzelne Duplikate überspringen)
6. `bank_statement_log` Eintrag anlegen
7. `import_log` Eintrag anlegen (wie eBon-Import)

## Nicht-lesen-Liste

- `src/app/api/bons/`, `src/app/api/produkte/`, `src/app/api/statistiken/` — keine Änderungen
- `src/components/bon-detail.tsx`, `product-list.tsx`, `statistik-dashboard.tsx` — keine Änderungen in PROJ-24
- `src/lib/avis-matching.ts` — relevant erst für PROJ-25
- `src/app/api/avis/` — kein Bezug

## Tests

### Bestehende Tests (Regression)
| Datei | Status |
|---|---|
| `src/app/api/paperless/sync/sync.test.ts` | Nur prüfen — kein Änderungsbedarf |
| `src/app/api/import/route.ts` (kein Test) | — |

### Neue Tests
| Datei | Typ | Szenarien |
|---|---|---|
| `src/lib/parser/konto.test.ts` | Unit (Vitest) | Kartenzahlung parsen, Überweisung parsen, Gutschrift parsen, Datum+Jahresüberlauf, Betrag-Konvertierung, Duplikat-Erkennung, unbekannter Typ → sonstige |
| `src/app/api/konto/import/import.test.ts` | Unit (Vitest) | Duplikat-Erkennung auf Auszugs-Ebene, Antwort-Struktur |
