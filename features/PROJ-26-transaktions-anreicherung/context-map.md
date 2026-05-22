# Context Map: PROJ-26 Transaktions-Anreicherung

> Für downstream Agents: Nur `spec.md` + diese Datei + die gelisteten Dateien lesen — kein eigenständiges Scanning nötig.

---

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/lib/db.ts` | Erweitern | `initDB()` bekommt neue Tabelle `transaction_aliases` + Migration `ALTER TABLE bank_transactions ADD COLUMN hidden INTEGER DEFAULT 0` |
| `src/app/api/konto/transactions/route.ts` | Erweitern | GET erweitern: LEFT JOIN mit `transaction_aliases`, neuer Query-Parameter `?hidden=0\|1\|all` (Default: 0) |
| `src/components/transaction-list.tsx` | Erweitern | Alias-Anzeige (alias statt beschreibung), Stift-Button → AliasDialog, Auge-Button → hide-Toggle, Tab "Ausgeblendet" |
| `src/components/bon-detail.tsx` | Erweitern | Logo anzeigen wenn zugehörige Transaktion Alias mit `logo_path` hat |
| `src/components/bank-transaction-badge.tsx` | Erweitern | Optional: Logo-Prop empfangen und rendern |
| `src/app/api/konto/transactions/alias/route.ts` | Neu erstellen | POST (upsert Alias + Logo-Upload via formData), DELETE (Alias löschen) |
| `src/app/api/konto/transactions/[id]/hide/route.ts` | Neu erstellen | PATCH: `hidden`-Feld toggeln (0→1 oder 1→0) — Pattern wie `[id]/assign/route.ts` |
| `src/app/api/konto/transactions/[id]/assign/route.ts` | Nur lesen | Referenz-Pattern für PATCH-Endpunkt mit dynamischer ID |
| `src/lib/db.ts` | Nur lesen | Gesamte `initDB()`-Struktur und Migration-Pattern verstehen |

---

## Kritische Typen & Interfaces

### Aktuell von `GET /api/konto/transactions` zurückgegebene Felder:
```ts
// bank_transactions JOIN (neu) transaction_aliases
{
  id: number
  buchungsdatum: string        // "YYYY-MM-DD"
  valutadatum: string
  typ: string
  beschreibung: string         // Rohtext, Schlüssel zu transaction_aliases
  haendler_name: string | null
  empfaenger_name: string | null
  verwendungszweck: string | null
  betrag_cents: number
  periode: string              // "YYYY-MM"
  kontoauszug_datei: string
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
  hidden: number               // NEU: 0 oder 1
  // NEU (aus JOIN mit transaction_aliases):
  alias: string | null
  logo_path: string | null
}
```

### Neue Tabelle `transaction_aliases`:
```ts
{
  beschreibung: string  // PRIMARY KEY — exakte beschreibung aus bank_transactions
  alias: string         // lesbarer Name
  logo_path: string | null  // z.B. "/badges/rewe-schoneberg.png"
  updated_at: string    // ISO timestamp
}
```

### Anzeigelogik für Beschreibungstext in transaction-list.tsx:
```ts
// Priorität: alias > haendler_name > empfaenger_name > beschreibung
const displayName = transaction.alias || transaction.haendler_name 
  || transaction.empfaenger_name || transaction.beschreibung
```

### Slug-Generierung für Logo-Dateinamen:
```ts
// Alias "REWE Schöneberg" → "rewe-schoneberg.png"
const slug = alias.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
```

---

## Existierende Patterns zum Wiederverwenden

- **DB-Migration**: In `src/lib/db.ts` → `initDB()` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` Pattern für SQLite
- **API-Route mit dynamischer ID**: `src/app/api/konto/transactions/[id]/assign/route.ts` — PATCH-Pattern
- **Logo in `public/badges/`**: `public/badges/edeka.png`, `public/badges/mastercard.png` — Slug-basierte Dateinamen
- **Dialog mit shadcn**: Bestehende Dialogs in `src/components/` als Referenz

---

## Nicht-lesen-Liste

Diese Bereiche sind für PROJ-26 nicht relevant:
- `src/app/api/bons/` — eBon-Import (anderes Feature)
- `src/app/api/import/` — PDF-Import
- `src/app/api/paperless/` — Paperless-Sync
- `src/components/product-*.tsx` — Produktdatenbank
- `src/components/statistics-*.tsx` — Statistik-Dashboard
- `features/PROJ-1` bis `features/PROJ-25` — andere Features
- `src/lib/parser/` — PDF-Parser

---

## Tests

### Bestehende Tests
| Datei | Aktion | Warum |
|-------|--------|-------|
| *(keine bekannten Tests für Transaktions-Komponenten)* | — | — |

### Neue Tests
| Datei | Typ | Was wird getestet |
|-------|-----|-------------------|
| `src/app/api/konto/transactions/alias/route.test.ts` | Unit | Alias-CRUD: upsert, delete, Slug-Generierung |
| `src/app/api/konto/transactions/[id]/hide/route.test.ts` | Unit | Toggle hidden: 0→1, 1→0 |
| `tests/proj-26-alias.spec.ts` | E2E | Alias anlegen, Anzeige in Liste, Logo sichtbar in Bonansicht, Ausblenden/Einblenden |
