# Context Map: PROJ-34 Import-Ansicht mit Reitern & Datei-Historien

**Created:** 2026-05-27  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
src/app/import/page.tsx  (Server Component — minimal, nur <ImportTabs /> einbetten)
+-- <ImportTabs />  (Client Component — neu, enthält Tabs-State)
    +-- <Tabs> (shadcn/ui, bereits installiert)
        +-- TabsList
        |   +-- TabsTrigger: "Import"
        |   +-- TabsTrigger: "eBons"
        |   +-- TabsTrigger: "AVIS"
        |   +-- TabsTrigger: "Bestellungen"
        |   +-- TabsTrigger: "Kontoauszüge"
        +-- TabsContent "Import"  → <ImportZone /> (unverändert)
        +-- TabsContent "eBons"  → <ImportHistoryTable type="ebon" />
        +-- TabsContent "AVIS"   → <ImportHistoryTable type="avis" />
        +-- TabsContent "Bestellungen" → <ImportHistoryTable type="bestellung" />
        +-- TabsContent "Kontoauszüge" → <ImportHistoryTable type="kontoauszug" />

<ImportHistoryTable />  (Client Component — neu, generisch für alle 4 Typen)
+-- Lädt Daten von GET /api/import/history?type=...
+-- <Table> (shadcn/ui)
+-- <Badge> für Match-Status (shadcn/ui)
+-- Leerer Zustand als Fallback
```

### Data Model

**Bestehende Tabellen — keine Schema-Änderung am Kern:**

`import_log` — bereits vorhanden, wird um `source_type` erweitert (Migration):
- `id`, `filename`, `status`, `message`, `imported_at` — bereits vorhanden
- `pdf_path` — bereits vorhanden (für Bestellungen; bei eBons und AVIS ggf. NULL)
- `order_date`, `order_total_cents` — bereits vorhanden (nur für Bestellungen befüllt)
- `source_type` TEXT — **NEU** (Migration), Werte: `'ebon'` | `'avis'` | `'bestellung'`
  - Bestehende Zeilen werden per Backfill befüllt (eBon: JOIN mit receipts, Bestellung: order_date IS NOT NULL, Rest: avis)

`bank_statement_log` — für Kontoauszug-Tab (bereits vorhanden):
- `id`, `konto_iban`, `periode`, `filename`, `imported_at`, `paperless_doc_id`
- Transaktionsanzahl: COUNT aus `bank_transactions.statement_id`

### Verknüpfungen für "gematchter eBon"

**AVIS → eBon:** `avis_matches.import_log_id = import_log.id` → `avis_matches.receipt_id` → `receipts`  
→ Nimm den häufigsten/ersten `receipt_id` pro `import_log_id` als Haupt-Match.

**Bestellung → eBon:** Gleiche Logik wie in `/api/bons/[id]/route.ts`:  
`order_date` ± 2 Tage + `order_total_cents` Abweichung ≤ 1500ct → passender Receipt.  
→ Umgekehrte Abfrage: für jede Bestellung den passenden Receipt finden.

### API-Endpunkt

`GET /api/import/history?type=ebon|avis|bestellung|kontoauszug`

Gibt ein Array von Einträgen zurück (sortiert nach `imported_at DESC`):

**ebon:**
```typescript
{ id: number; filename: string; imported_at: string; store_name: string | null;
  store_chain: string | null; receipt_date: string | null;
  total_amount_cents: number | null; has_bank_match: boolean }
```

**avis:**
```typescript
{ id: number; filename: string; imported_at: string;
  matched_receipt_date: string | null; matched_receipt_total_cents: number | null;
  has_match: boolean }
```

**bestellung:**
```typescript
{ id: number; filename: string; imported_at: string;
  order_number: string | null; order_date: string | null;
  order_total_cents: number | null;
  matched_receipt_date: string | null; matched_receipt_total_cents: number | null;
  has_match: boolean }
```

**kontoauszug:**
```typescript
{ id: number; filename: string | null; imported_at: string;
  konto_iban: string; periode: string; transaction_count: number }
```

### Tech Decisions

- **shadcn/ui `<Tabs>`** bereits installiert — kein neues Package nötig
- **shadcn/ui `<Table>`** bereits installiert — konsistentes Look & Feel
- **`source_type`-Spalte in `import_log`** statt Filename-Heuristik: sauberere Unterscheidung der Import-Typen, auch wenn ein AVIS-Import keine Matches hatte
- **Ein generischer `<ImportHistoryTable>`** statt 4 separate Komponenten: die Spalten unterscheiden sich je Type, werden per `type`-Prop gesteuert
- **Kein URL-State für aktiven Tab**: einfacher, da kein Deep-Linking benötigt wird

### Dependencies (packages to install)

Keine neuen Packages erforderlich (Tabs, Table, Badge bereits in shadcn/ui vorhanden).

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) lesen **NUR** die unten gelisteten Dateien.
> Keine eigenständige Codebase-Suche.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/import/page.tsx` | Erweitern | `<ImportZone />` durch `<ImportTabs />` ersetzen |
| `src/components/import-zone.tsx` | Nur lesen | Wird zu Tab-1-Inhalt; keine Änderung, aber als Referenz lesen |
| `src/components/import-tabs.tsx` | Neu erstellen | Client Component mit Tabs-Wrapper + 5 TabsContent |
| `src/components/import-history-table.tsx` | Neu erstellen | Generische Historientabelle für alle 4 Import-Typen |
| `src/app/api/import/history/route.ts` | Neu erstellen | GET-Endpunkt für alle vier Import-Historien |
| `src/lib/db.ts` | Erweitern | Migration: `source_type` Spalte zu `import_log` hinzufügen + Backfill |
| `src/app/api/import/route.ts` | Erweitern | `source_type = 'ebon'` bei INSERT in import_log setzen |
| `src/app/api/avis/import/route.ts` | Erweitern | `source_type = 'avis'` bei INSERT in import_log setzen |
| `src/app/api/bestellung/import/route.ts` | Erweitern | `source_type = 'bestellung'` bei INSERT in import_log setzen |
| `src/app/api/paperless/sync/route.ts` | Erweitern | `source_type = 'ebon'` bei import_log-Einträgen setzen |
| `src/app/api/paperless/avis-sync/route.ts` | Erweitern | `source_type = 'avis'` bei import_log-Einträgen setzen |
| `src/app/api/paperless/bestellung-sync/route.ts` | Erweitern | `source_type = 'bestellung'` bei import_log-Einträgen setzen |
| `src/app/api/bons/[id]/route.ts` | Nur lesen | Referenz für Bestellung→eBon Matching-Logik (gleiche SQL-Logik wiederverwenden) |
| `src/components/ui/tabs.tsx` | Nur lesen | shadcn Tabs — kein Edit, nur API verstehen |
| `src/components/ui/table.tsx` | Nur lesen | shadcn Table — kein Edit, nur API verstehen |
| `src/components/ui/badge.tsx` | Nur lesen | shadcn Badge — für Match-Status-Badges |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// import_log (nach Migration)
interface ImportLogRow {
  id: number
  filename: string
  status: string           // 'success' | 'duplicate' | 'error'
  message: string | null
  imported_at: string      // ISO datetime string
  paperless_doc_id: number | null
  pdf_path: string | null
  order_date: string | null        // nur für Bestellungen
  order_total_cents: number | null // nur für Bestellungen
  source_type: string | null       // 'ebon' | 'avis' | 'bestellung' (neu)
}

// bank_statement_log (bereits vorhanden)
interface BankStatementLogRow {
  id: number
  konto_iban: string
  periode: string          // z. B. "2026-01"
  filename: string | null
  imported_at: string
  paperless_doc_id: number | null
}

// Response-Typen für GET /api/import/history
type HistoryType = 'ebon' | 'avis' | 'bestellung' | 'kontoauszug'

interface EbonHistoryEntry {
  id: number
  filename: string
  imported_at: string
  store_name: string | null
  store_chain: string | null   // 'rewe' | 'lidl' | 'kaufland'
  receipt_date: string | null
  total_amount_cents: number | null
  has_bank_match: boolean
}

interface AvisHistoryEntry {
  id: number
  filename: string
  imported_at: string
  matched_receipt_date: string | null
  matched_receipt_total_cents: number | null
  has_match: boolean
}

interface BestellungHistoryEntry {
  id: number
  filename: string
  imported_at: string
  order_number: string | null
  order_date: string | null
  order_total_cents: number | null
  matched_receipt_date: string | null
  matched_receipt_total_cents: number | null
  has_match: boolean
}

interface KontoauszugHistoryEntry {
  id: number
  filename: string | null
  imported_at: string
  konto_iban: string
  periode: string
  transaction_count: number
}
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/bons/` — Bon-Detail-APIs, nicht berührt (außer `[id]/route.ts` als Nur-Lesen-Referenz)
- `src/app/api/konto/` — Kontoauszug-Transaktionen, nicht berührt
- `src/app/api/produkte/` — Produktdatenbank, unberührt
- `src/app/api/statistiken/` — Dashboard-APIs, unberührt
- `src/app/api/export/` — Export-APIs, unberührt
- `src/app/api/backup/` — Backup, unberührt
- `src/components/bon-detail.tsx` und alle anderen Business-Komponenten — unberührt
- `src/components/ui/` — shadcn (nur die drei oben gelisteten lesen)

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

Keine bestehenden Tests betroffen (die neuen Dateien haben keine bestehenden Test-Gegenstücke).

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/PROJ-34-import-tabs.spec.ts` | E2E | Reiter-Navigation, eBon-Tabelle anzeigen, AVIS-Match-Badge, Bestellungs-Match-Badge, leerer Zustand je Tab |
