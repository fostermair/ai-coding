# Context Map: PROJ-18 — Paperless-ngx eBon Import

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/paperless/sync/route.ts` | Neu erstellen | Neuer Sync-Endpunkt: paperless API → PDF download → parse → DB insert |
| `src/components/paperless-sync.tsx` | Neu erstellen | Client Component: Sync-Button, Loading-State, Ergebnis-Anzeige |
| `src/lib/import-log.ts` | Neu erstellen | `logImport()` aus `import/route.ts` extrahieren — von beiden Routen genutzt |
| `src/lib/pdfjs-polyfill.ts` | Neu erstellen | pdfjs Node.js-Polyfill-Block aus `import/route.ts` extrahieren |
| `src/app/import/page.tsx` | Erweitern | `process.env`-Check hinzufügen + `<PaperlessSync isConfigured={...}>` rendern |
| `src/app/api/import/route.ts` | Erweitern (leicht) | `logImport` + Polyfill durch Imports aus neuen Lib-Dateien ersetzen |
| `src/lib/parser/rewe.ts` | Nur lesen | `parseReweEbon()` wird direkt importiert — keine Änderungen |
| `src/lib/db.ts` | Nur lesen | `getDb()` Nutzungsmuster referenzieren |
| `src/components/import-zone.tsx` | Nur lesen | Visuelles Referenz-Pattern für Status-Farben und ImportSummary-Stil |

## Kritische Typen & Interfaces

### API Response: `POST /api/paperless/sync`
```ts
interface PaperlessSyncResponse {
  imported: number
  duplicates: number
  errors: number
  details: Array<{
    filename: string           // "[paperless] {document.title}"
    status: "success" | "duplicate" | "error"
    message?: string           // nur bei error
  }>
}
```

### PaperlessSync Component Props
```ts
interface PaperlessSyncProps {
  isConfigured: boolean  // vom Server Component übergeben
}
```

### Internes paperless-ngx Dokumentformat (API-Response)
```ts
interface PaperlessDocument {
  id: number
  title: string
  correspondent: number
  document_type: number
  created: string  // ISO date
}

interface PaperlessListResponse {
  count: number
  next: string | null  // Pagination URL
  results: PaperlessDocument[]
}
```

### logImport Signatur (aus import/route.ts extrahieren)
```ts
function logImport(
  filename: string,
  status: "success" | "duplicate" | "error",
  message?: string
): void
```

## paperless-ngx API Endpunkte

```
GET {PAPERLESS_URL}/api/documents/
  ?correspondent__id={PAPERLESS_CORRESPONDENT_ID}
  &document_type__id={PAPERLESS_DOCUMENT_TYPE_ID}
  &page_size=100
  Authorization: Token {PAPERLESS_TOKEN}
  → PaperlessListResponse

GET {PAPERLESS_URL}/api/documents/{id}/download/
  Authorization: Token {PAPERLESS_TOKEN}
  → PDF binary (Buffer)
```

## Env Vars (`.env.local`)
```
PAPERLESS_URL=http://localhost:8000
PAPERLESS_TOKEN=your-token-here
PAPERLESS_CORRESPONDENT_ID=1
PAPERLESS_DOCUMENT_TYPE_ID=2
```

## Wiederverwendbare Logik aus `src/app/api/import/route.ts`

**Duplikat-Check (Zeile ~103):**
```ts
const existing = db.prepare(
  "SELECT id FROM receipts WHERE receipt_nr = ? AND market_nr = ? AND receipt_date = ?"
).get(parsed.receiptNr, parsed.marketNr, parsed.receiptDate)
```

**pdfjs-Polyfill (Zeilen 8–41):** Block mit `DOMMatrix`, `ImageData`, `Path2D` → extrahieren nach `src/lib/pdfjs-polyfill.ts`

**logImport (Zeilen ~193–204):** Schreibt Row in `import_log` → extrahieren nach `src/lib/import-log.ts`

**DB-Transaktionsmuster:** Receipt + Items + Discounts + Log-Eintrag als atomare Transaktion — identisches Muster in Sync-Route verwenden.

## Nicht-lesen-Liste

- `src/app/api/bons/` — Bon-Ansicht, nicht relevant
- `src/app/api/produkte/` — Produktdatenbank, nicht relevant
- `src/app/api/statistiken/` — Statistiken, nicht relevant
- `src/components/bon-*.tsx` — Bon-Anzeige-Komponenten, nicht relevant
- `src/components/product-list.tsx` — Produktliste, nicht relevant
- `src/components/statistik-dashboard.tsx` — Dashboard, nicht relevant
- `tests/` — Keine bestehenden E2E-Tests betroffen

## Tests

### Bestehende Tests

| Datei | Aktion | Grund |
|---|---|---|
| `src/app/api/import/route.ts` hat keine .test-Datei | — | Keine bestehenden Tests zu aktualisieren |

### Neue Tests

| Datei | Typ | Was testen |
|---|---|---|
| `src/app/api/paperless/sync/route.test.ts` | Unit (Vitest) | 400 bei fehlenden Env Vars, 401-Handling, 502-Handling, Pagination, import/duplicate/error counts, import_log Einträge mit [paperless]-Prefix |
| `src/lib/import-log.test.ts` | Unit (Vitest) | Schreibt korrekte Row in import_log |
| `tests/paperless-sync.spec.ts` | E2E (Playwright) | Button disabled ohne Config, Sync-Flow mit Mock, Fehlermeldung bei 401 |
