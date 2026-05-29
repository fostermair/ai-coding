# PROJ-33: Context Map — Mehrere Bestellungen pro Bon

## Architektur-Überblick

Rein backend-seitige Änderung — kein UI wird gebaut. Vier Stellen im Code werden minimal angepasst:

1. **Duplikat-Checks entfernen** — zwei Import-Routen blockieren heute identische Bestellnummern
2. **Artikel-Deduplication** — beim Abrufen der Bestellartikel im Bon-Detail per ORDER BY + GROUP BY dedupliziert zusammengeführt
3. **Neuestes PDF** — die PDF-Route liefert statt irgendeinem das zuletzt importierte PDF

Das Datenmodell (Tabellen `import_log`, `bestellung_items`) bleibt unverändert. Es wird nichts migriert.

---

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/app/api/bestellung/import/route.ts` | Erweitern | Duplikat-Check (Zeile 103–112) entfernen |
| `src/app/api/paperless/bestellung-sync/route.ts` | Erweitern | Duplikat-Check (Zeile 198–211) entfernen; `SyncDetail.status` um "duplicate" bereinigen |
| `src/app/api/bons/[id]/route.ts` | Erweitern | Bestellartikel-Abfrage: GROUP BY für Deduplication (Zeile 151–165) |
| `src/app/api/bons/[id]/bestellung-pdf/route.ts` | Erweitern | PDF-Query: statt LIMIT 1 (beliebig) → ORDER BY il.id DESC LIMIT 1 (neuestes) |
| `src/app/api/bons/route.ts` | Nur lesen | `has_bestellung`-Flag: Query funktioniert unverändert über alle import_log-Einträge |

---

## Detaillierte Änderungen pro Datei

### 1. `src/app/api/bestellung/import/route.ts`

**Entfernen:** Block Zeile 103–112 (Duplikat-Check + 409-Response):
```
// ── Duplicate check: order_number must be unique ──────────────────────
const existing = db
  .prepare("SELECT id FROM bestellung_items WHERE order_number = ? LIMIT 1")
  .get(parsed.orderNumber)

if (existing) {
  const msg = `Bestellung bereits importiert (Bestellnummer: ${parsed.orderNumber})`
  logImport(file.name, "duplicate", msg)
  return NextResponse.json({ message: msg }, { status: 409 })
}
```
→ Datei ansonsten unverändert lassen.

---

### 2. `src/app/api/paperless/bestellung-sync/route.ts`

**Entfernen:** Block Zeile 198–211 (Duplikat-Check + `duplicates++` + details.push):
```
// Check for duplicate (by order_number)
const existingBestellung = db
  .prepare("SELECT id FROM bestellung_items WHERE order_number = ? LIMIT 1")
  .get(parsed.orderNumber) as { id: number } | undefined

if (existingBestellung) {
  duplicates++
  details.push({
    title: docTitle,
    status: "duplicate",
    message: `Bestellnummer ${parsed.orderNumber} bereits importiert`,
  })
  continue
}
```

**Anpassen:** `SyncDetail.status` Typ — "duplicate" entfernen:
```typescript
// Vorher:
status: "imported" | "duplicate" | "error"
// Nachher:
status: "imported" | "error"
```

**Optional:** Die `duplicates`-Variable und deren Zählung im Response können bleiben (immer 0) oder ebenfalls entfernt werden — ist nicht störend.

---

### 3. `src/app/api/bons/[id]/route.ts`

**Ändern:** Die Bestellartikel-Abfrage (Zeile 151–165) aggregiert bereits alle `bestellung_items` nach `order_number` über alle `import_log`-Einträge. Mit mehreren Einträgen können jetzt Duplikate entstehen (gleicher Artikel in mehreren PDFs). Deduplication per SQL-GROUP BY hinzufügen:

```
// Vorher:
SELECT id, article_name, quantity_amount, quantity_unit, unit_price_cents, total_price_cents
FROM bestellung_items
WHERE order_number = ?
ORDER BY id

// Nachher:
SELECT MIN(id) as id, article_name, quantity_amount, quantity_unit,
       MIN(unit_price_cents) as unit_price_cents,
       MIN(total_price_cents) as total_price_cents
FROM bestellung_items
WHERE order_number = ?
GROUP BY article_name, quantity_amount, quantity_unit
ORDER BY MIN(id)
```

Typ-Interface `rawBestellungItems` (Zeile 158–165) bleibt identisch — Spalten unverändert.

---

### 4. `src/app/api/bons/[id]/bestellung-pdf/route.ts`

**Ändern:** PDF-Abfrage (Zeile 71–80) liefert aktuell das erste gefundene PDF (`LIMIT 1` ohne ORDER BY). Mit mehreren import_log-Einträgen soll das neueste geliefert werden:

```
// Vorher:
SELECT DISTINCT il.pdf_path
FROM bestellung_items bi
INNER JOIN import_log il ON bi.import_log_id = il.id
WHERE bi.order_number = ?
LIMIT 1

// Nachher:
SELECT il.pdf_path
FROM import_log il
WHERE il.id = (
  SELECT MAX(bi.import_log_id)
  FROM bestellung_items bi
  WHERE bi.order_number = ?
)
```

---

## Kritische Typen & Interfaces

### BestellungItem (aus `bon-detail.tsx`)
```typescript
interface BestellungItem {
  article_name: string
  quantity_amount: number
  quantity_unit: string
  unit_price_cents: number
  total_price_cents: number
  matched_receipt_item_id?: number | null
  match_score?: number
}
```

### SyncDetail (aus `paperless/bestellung-sync/route.ts`)
```typescript
interface SyncDetail {
  title: string
  status: "imported" | "duplicate" | "error"  // → "duplicate" entfernen
  message?: string
}
```

### rawBestellungItems Query-Rückgabetyp (aus `bons/[id]/route.ts`, Zeile 158–165)
```typescript
Array<{
  id: number
  article_name: string
  quantity_amount: number
  quantity_unit: string
  unit_price_cents: number
  total_price_cents: number
}>
```

---

## Nicht-lesen-Liste

Für diese Änderung irrelevant:
- `src/components/` — kein UI-Change
- `src/app/api/avis/` — kein AVIS-Bezug
- `src/app/api/konto/` — kein Konto-Bezug
- `src/app/api/produkte/` — kein Produktlisten-Bezug
- `src/app/api/statistiken/` — kein Statistik-Bezug
- `src/app/api/export/` — kein Export-Bezug
- `src/lib/parser/bestellung.ts` — Parser bleibt unverändert
- `src/lib/db.ts` — Schema bleibt unverändert

---

## Tests

### Bestehende Tests (prüfen)

| Datei | Aktion | Grund |
|-------|--------|-------|
| `src/app/api/bons/bons-avis-status.test.ts` | Regression prüfen | Testet Bon-Liste inkl. has_bestellung-Flag |

### Neue Tests (erstellen)

| Datei | Typ | Was wird getestet |
|-------|-----|-------------------|
| `src/app/api/bestellung/import/import.test.ts` | Unit | Zweiter Import mit gleicher Bestellnummer wird akzeptiert (kein 409 mehr) |
| `src/app/api/bons/bestellung-merge.test.ts` | Unit | Zwei import_log-Einträge zur gleichen Bestellnummer → Bon-Detail liefert deduplizierte Artikelliste |

---

## Vorher / Nachher Vergleich (für QA)

| Verhalten | Vorher | Nachher |
|-----------|--------|---------|
| 2. Import gleicher Bestellnr. | 409 Conflict | 200 OK, neuer import_log-Eintrag |
| Paperless-Sync doppeltes Dokument | "duplicate" | Wird importiert |
| Bon-Detail Artikelliste | Aus einem import_log | Deduplizierter Merge aller import_log-Einträge |
| PDF im Bestellung-Tab | Erstes gefundenes PDF | Neuestes importiertes PDF (MAX import_log_id) |
| has_bestellung-Flag | Unverändert | Unverändert |
