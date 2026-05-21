# Context Map: PROJ-25 — Bon-Kontoauszug Abgleich & Visualisierung

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | Migration: `receipts` bekommt `is_virtual` + `bank_transaction_id` |
| `src/lib/konto-matching.ts` | Neu erstellen | Matching-Logik: Auto-Match, Pending, virtueller Bon, Re-Matching |
| `src/app/api/konto/match/route.ts` | Neu erstellen | POST: Matching für alle offenen Transaktionen auslösen |
| `src/app/api/konto/transactions/route.ts` | Neu erstellen | GET: Liste aller `bank_transactions` mit Match-Status |
| `src/app/api/konto/transactions/[id]/assign/route.ts` | Neu erstellen | POST (zuordnen) / DELETE (aufheben) manuelle Zuordnung |
| `src/app/transaktionen/page.tsx` | Neu erstellen | Neue Seite `/transaktionen` |
| `src/components/transaction-list.tsx` | Neu erstellen | Tabelle aller Transaktionen mit Filter + Status-Badge |
| `src/components/transaction-assign-dialog.tsx` | Neu erstellen | Manuelle Zuordnungs-Dialog (Bon-Suche ±7 Tage) |
| `src/components/bank-transaction-badge.tsx` | Neu erstellen | Badge "Kontoabbuchung: -49,08 € (19.05.2026)" in Bon-Detail |
| `src/components/bon-list.tsx` | Erweitern | Virtuelle Bons anzeigen (gestrichelter Rahmen, Kreditkarten-Icon) |
| `src/components/bon-detail.tsx` | Erweitern | BankTransactionBadge einbinden |
| `src/components/statistik-dashboard.tsx` | Erweitern | Gesamtausgaben-Abfrage berücksichtigt `is_virtual=1` Bons |
| `src/components/nav.tsx` | Erweitern | Navigations-Link "Transaktionen" → `/transaktionen` |
| `src/app/api/import/route.ts` | Erweitern | Nach Bon-Import: Re-Matching für offene Transaktionen anstoßen |
| `src/lib/avis-matching.ts` | Nur lesen | Bewährtes Matching-Muster im Projekt (Vorlage für konto-matching.ts) |
| `src/lib/db.ts` | Nur lesen | Schema `receipts` + `bank_transactions` (Spalten, Typen) |

## Kritische Typen & Interfaces

### Matching-Ergebnis (`src/lib/konto-matching.ts`)
```typescript
export interface MatchResult {
  transactionId: number
  outcome: 'matched' | 'pending' | 'virtual'
  receiptId?: number          // bei matched oder virtual (neu angelegter Bon)
  candidateIds?: number[]     // bei pending: alle Kandidaten
}

export interface MatchingSummary {
  matched: number
  pending: number
  virtual: number
  skipped: number             // bereits gematcht oder ignored
}
```

### DB-Erweiterung `receipts`
```typescript
// Neue Spalten (Migration via ALTER TABLE ... ADD COLUMN IF NOT EXISTS):
is_virtual: number            // 0 = echter Bon, 1 = virtueller Bon
bank_transaction_id: number | null  // FK → bank_transactions.id
```

### API Response: `GET /api/konto/transactions`
```typescript
interface TransactionWithMatch {
  id: number
  buchungsdatum: string
  valutadatum: string
  typ: string
  beschreibung: string
  haendler_name: string | null
  betrag_cents: number
  periode: string
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
}
```

### API Response: `POST /api/konto/match`
```typescript
interface MatchingResult {
  matched: number
  pending: number
  virtual: number
  skipped: number
}
```

### API: `POST /api/konto/transactions/[id]/assign`
```typescript
// Request body:
interface AssignRequest {
  receipt_id: number
}
// Response:
interface AssignResult {
  success: boolean
  message?: string
}
```

### BankTransactionBadge Props
```typescript
interface BankTransactionBadgeProps {
  betrag_cents: number
  buchungsdatum: string
  match_source: 'auto' | 'manual'
}
```

## Matching-Logik (konto-matching.ts)

```
Für jede Transaktion WHERE match_status = 'unmatched'
                        AND typ IN ('kartenzahlung', 'überweisung'):

  1. SQL: SELECT id, store_chain, total_amount_cents FROM receipts
          WHERE receipt_date BETWEEN date(buchungsdatum, '-1 day')
                              AND date(buchungsdatum, '+1 day')
          AND total_amount_cents = ABS(betrag_cents)
          AND is_virtual = 0

  2. Händler-Filter (nur bei Kartenzahlung):
     - 'REWE' in beschreibung.toUpperCase() → store_chain = 'rewe'
     - 'LIDL' in beschreibung.toUpperCase() → store_chain = 'lidl'
     - 'KAUFLAND' in beschreibung.toUpperCase() → store_chain = 'kaufland'
     - Kein Match auf bekannte Kette → kein Filter, alle Kandidaten

  3. Ergebnis:
     - 1 Kandidat  → UPDATE match_status='matched', matched_receipt_id, match_source='auto'
     - >1 Kandidat → UPDATE match_status='pending'
     - 0 Kandidaten → virtuellen Bon anlegen + UPDATE match_status='virtual'
```

**Virtuellen Bon anlegen:**
```sql
INSERT INTO receipts (filename, store_name, receipt_date, total_amount_cents,
                      is_virtual, bank_transaction_id, imported_at)
VALUES ('[virtual]', haendler_name, buchungsdatum, ABS(betrag_cents),
        1, transaction_id, datetime('now'))
```

**Re-Matching nach echtem Bon-Import:**
```
Nach INSERT eines neuen echten Bons:
  Suche: bank_transactions WHERE match_status IN ('unmatched', 'virtual')
                             AND ABS(betrag_cents) = new_bon.total_amount_cents
                             AND buchungsdatum BETWEEN date(new_bon.receipt_date, '-1 day')
                                              AND date(new_bon.receipt_date, '+1 day')
  Falls gefunden + match_source != 'manual':
    - Virtuellen Bon (falls vorhanden) löschen
    - Transaktion: match_status='matched', matched_receipt_id=new_bon.id, match_source='auto'
```

## DB-Migration (src/lib/db.ts)

Direkt nach den `CREATE TABLE IF NOT EXISTS`-Blöcken für `bank_transactions`:
```typescript
const receiptCols2 = db.prepare("PRAGMA table_info(receipts)").all() as Array<{ name: string }>
if (!receiptCols2.some(c => c.name === 'is_virtual')) {
  db.exec("ALTER TABLE receipts ADD COLUMN is_virtual INTEGER NOT NULL DEFAULT 0")
}
if (!receiptCols2.some(c => c.name === 'bank_transaction_id')) {
  db.exec("ALTER TABLE receipts ADD COLUMN bank_transaction_id INTEGER REFERENCES bank_transactions(id)")
}
```

Achtung: `receiptCols` ist bereits für frühere Migrationen als Variable deklariert — neue Variable `receiptCols2` verwenden oder bestehenden Block erweitern.

## Navigation (nav.tsx)

```typescript
const navLinks = [
  { href: "/", label: "Bons" },
  { href: "/import", label: "Import" },
  { href: "/produkte", label: "Produkte" },
  { href: "/statistiken", label: "Statistiken" },
  { href: "/transaktionen", label: "Transaktionen" },  // NEU
]
```

## Bon-Übersicht (bon-list.tsx)

Virtueller Bon: `is_virtual = 1` → visuell unterscheidbar:
- Gestrichelter Rahmen (`border-dashed`)
- Kreditkarten-Icon (lucide-react: `CreditCard`)
- Label "Nur Kontoauszug" (Badge, gray variant)
- Kein Klick auf Detailansicht (keine Items)

API-Query für Bon-Liste muss `is_virtual`-Spalte mitliefern.

## Dashboard (statistik-dashboard.tsx)

Gesamtausgaben-Query muss virtuelle Bons einbeziehen:
```sql
-- Vorher: SUM(total_amount_cents) FROM receipts WHERE ...
-- Nachher: gleiche Query, da is_virtual=1 Bons auch in receipts-Tabelle liegen
-- Keine SQL-Änderung nötig, solange kein Filter auf is_virtual=0 besteht
```

Falls bestehende Queries `is_virtual = 0` filtern: Bedingung entfernen oder anpassen.

## Nicht-lesen-Liste

- `src/app/api/avis/` — kein Bezug zu Kontoauszug-Matching
- `src/lib/avis-matching.ts` — nur als Vorlage lesen, nicht ändern
- `src/components/avis-*.tsx` — keine Änderungen
- `src/app/api/export/` — kein Bezug
- `src/app/api/produkte/` — kein Bezug
- `src/app/api/statistiken/` — ggf. Gesamtausgaben-Route prüfen, aber kein zwingendes Änderungsbedarf

## Tests

### Bestehende Tests (Regression)
| Datei | Status |
|---|---|
| `src/app/api/bons/bons-avis-status.test.ts` | Regression prüfen — bon-list Queries könnten betroffen sein |
| `src/app/api/import/route.ts` (Basis) | Kein Unit-Test vorhanden; E2E-Regression |

### Neue Tests
| Datei | Typ | Szenarien |
|---|---|---|
| `src/lib/konto-matching.test.ts` | Unit (Vitest) | Auto-Match (1 Kandidat), Pending (>1 Kandidat), Virtual (0 Kandidaten), Re-Matching nach echtem Bon, manuell zugeordnet bleibt erhalten |
| `src/app/api/konto/match/match.test.ts` | Unit (Vitest) | Response-Struktur, Idempotenz (zweites Matching ändert nichts bei bereits gematchten) |
