# PROJ-32: Context Map

> Bestellbestätigung-Import & Produktmengen-Verknüpfung

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/lib/parser/bestellung.ts` | Nur lesen | PDF-Parser für Bestellbestätigungen, exportiert `parseBestellung()` |
| `src/app/api/bestellung/import/route.ts` | Nur lesen | Manuelle Upload-Route, speichert PDFs und Bestelldaten in DB |
| `src/app/api/paperless/bestellung-sync/route.ts` | Nur lesen | Paperless-ngx Sync-Route, holt Bestellbestätigungen von Paperless |
| `src/app/api/bons/[id]/bestellung-pdf/route.ts` | Nur lesen | PDF-Serving-Route, liefer PDFs aus lokalem Speicher oder Paperless |
| `src/app/api/bons/[id]/route.ts` | Nur lesen | Lädt Bestelldaten für Bon-Detail-View, matcht `bestellung_items` zu `receipt_items` |
| `src/components/bon-detail.tsx` | Erweitern (✓ fixes applied) | "Bestellung" Tab, Bestellartikel-Spalte, Preis/100g-Berechnung |
| `src/components/import-zone.tsx` | Nur lesen | Upload-UI mit Bestellbestätigung-Zone |
| `src/lib/db.ts` | Nur lesen | DB-Schema: `bestellung_items` Tabelle, `import_log.pdf_path` Spalte |
| `.env.local.example` | Nur lesen | Env-Vars: `PAPERLESS_BESTELLUNG_TAG`, `PAPERLESS_BESTELLUNG_CORRESPONDENT_ID`, `PAPERLESS_BESTELLUNG_DOCUMENT_TYPE_ID` |

## Kritische Typen & Interfaces

### ParsedBestellung (src/lib/parser/bestellung.ts)
```typescript
export interface ParsedBestellungItem {
  articleName: string
  quantityAmount: number
  quantityUnit: string // 'g', 'kg', 'ml', 'l', 'Stück', 'Packung', '6x330ml', etc.
  unitPriceCents: number
  totalPriceCents: number
}

export interface ParsedBestellung {
  orderNumber: string
  items: ParsedBestellungItem[]
}

export function parseBestellung(text: string): ParsedBestellung
```

### BestellungItem (src/components/bon-detail.tsx)
```typescript
interface BestellungItem {
  article_name: string
  quantity_amount: number
  quantity_unit: string
  unit_price_cents: number
  total_price_cents: number
}
```

### BonDetail API response (GET /api/bons/[id])
```typescript
{
  // ... existing receipt fields ...
  has_bestellung: boolean
  bestellung_order_number: string | null
  bestellung_items: BestellungItem[]
  // items[].avis_match includes avisItemName for fuzzy matching
}
```

### Database: bestellung_items table
```sql
CREATE TABLE bestellung_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_log_id INTEGER REFERENCES import_log(id),
  order_number TEXT NOT NULL,
  article_name TEXT NOT NULL,
  quantity_amount REAL,
  quantity_unit TEXT,
  unit_price_cents INTEGER,
  total_price_cents INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
)
```

### Database: import_log.pdf_path column
```sql
ALTER TABLE import_log ADD COLUMN pdf_path TEXT
```

## Nicht-lesen-Liste

- `src/components/ui/` — shadcn/ui components, nicht berührt
- `src/app/api/produkte/` — Product API, nicht berührt
- `src/app/api/avis/` — AVIS API, nicht berührt (dependency nur für Linking)
- Tests außer PROJ-32 Tests

## Tests

### Bestehende Tests (Regression prüfen)
- `src/lib/parser/bestellung.test.ts` — Lesen + ausführen. Falls vorhanden, prüfen ob Parsing noch funktioniert nach bon-detail.tsx Änderungen (sollte nicht getroffen sein)

### Neue Tests (erstellen für QA)

**Unit Tests:**
- File: `src/lib/parser/bestellung.test.ts` (create if missing)
  - Teste `parseBestellung()` mit verschiedenen REWE Bestellbestätigung Formaten
  - Teste Mengenformat-Varianten: "500g", "0,5 kg", "6x330ml", "1 Stück"

**E2E Tests:**
- File: `tests/bestellung-import.spec.ts` (create)
  - Manuelle Upload: PDF hochladen → verify in DB
  - Duplikat-Schutz: gleiche Bestellnummer zweimal → 409
  - Bon-Detail: Bestellung Tab öffnen → PDF lädt
  - Bestellartikel-Spalte: zeigt gematchten Artikel pro Zeile
  - Preis/100g: 500g für €2,50 → €0,50/100g, 1l Milch für €1,50 → €0,15/100ml

## Bugs Fixed in this Context

✓ **Bug 1**: Preis/100g Formel war `unit_price_cents * 100 / 100`. Fixed: Dividiert durch Mengenbetrag mit Einheit-Umrechnung (g/ml ÷100, kg/l ÷10)

✓ **Bug 2**: Alle Zeilen zeigten `bestellungItems[0]`. Fixed: Fuzzy-Match (`findBestBestellungMatch()`) pro Zeile mit Wort-Overlap zwischen AVIS-Name und Bestellung-Artikel-Name
