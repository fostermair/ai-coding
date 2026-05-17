# Context Map: PROJ-18 — Paperless-ngx eBon Import

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/paperless/sync/route.ts` | Neu erstellt ✅ | POST-Endpunkt: Paginierter paperless-API-Abruf, PDF-Download, Parsing, Duplikat-Check, DB-Transaktion, Logging |
| `src/components/import-zone.tsx` | Erweitert ✅ | Neuer Sync-Button, States (isSyncing, syncResult, syncError, paperlessConfigured), Handler, UI-Block mit Detail-Anzeige |
| `.env.local.example` | Erweitert ✅ | 4 neue Variablen: PAPERLESS_URL, PAPERLESS_TOKEN, PAPERLESS_CORRESPONDENT_ID, PAPERLESS_DOCUMENT_TYPE_ID |
| `src/app/api/paperless/sync/sync.test.ts` | Neu erstellt ✅ | Vitest Unit-Tests: Config-Check, Duplikat-Detection, Transaction-Integrity, Logging, Response-Structure |
| `src/app/api/import/route.ts` | Nur lesen | Duplikat-Logik-Query (Zeile 104–108), Transaktion-Pattern (Zeile 117–174), logImport-Funktion (Zeile 193–204) |
| `src/lib/parser/rewe.ts` | Nur lesen | parseReweEbon(text): ParsedReceipt, formatGermanDate(iso) |
| `src/lib/db.ts` | Nur lesen | getDb() Singleton, Schema-Initialisierung |

## Kritische Typen & Interfaces

### API Response: `POST /api/paperless/sync`
```typescript
interface SyncDetail {
  title: string
  status: "imported" | "duplicate" | "error"
  message?: string
}

interface SyncResult {
  imported: number
  duplicates: number
  errors: number
  details: SyncDetail[]
  message?: string
}
```

### Frontend Component (import-zone.tsx)
```typescript
interface SyncResult {
  imported: number
  duplicates: number
  errors: number
  details: Array<{ title: string; status: string; message?: string }>
}
```

### Internes paperless-ngx API-Response (Dokumentliste)
```typescript
interface PaperlessDocument {
  id: number
  title: string
  correspondent: number
  document_type: number
  created: string
}

interface PaperlessListResponse {
  count: number
  next: string | null  // Pagination URL
  results: PaperlessDocument[]
}
```

## paperless-ngx API Endpunkte

```
GET {PAPERLESS_URL}/api/documents/?correspondent__id=X&document_type__id=Y&page_size=100
  Authorization: Token {PAPERLESS_TOKEN}
  → { results: [...], next: "url_for_page_2" | null }

GET {PAPERLESS_URL}/api/documents/{id}/download/
  Authorization: Token {PAPERLESS_TOKEN}
  → PDF binary (Buffer)
```

## Env Vars (`.env.local` — dokumentiert in `.env.local.example`)

```
PAPERLESS_URL=http://localhost:8000
PAPERLESS_TOKEN=your_paperless_api_token_here
PAPERLESS_CORRESPONDENT_ID=1
PAPERLESS_DOCUMENT_TYPE_ID=2
```

## Technische Implementierungs-Details

### API-Route (`src/app/api/paperless/sync/route.ts`)
- **Paginierung:** `while (apiResponse.next) { documentUrl = apiResponse.next }`
- **Auth-Header:** `{ Authorization: 'Token {PAPERLESS_TOKEN}' }`
- **PDF-Polyfill:** 1:1 Kopie aus `/api/import/route.ts` Zeilen 8–41 (DOMMatrix, ImageData, Path2D)
- **Duplikat-Check:** Exakt `receipt_nr + market_nr + receipt_date` (Zeile 104–108 in import/route.ts)
- **Transaktion:** Identisches Pattern wie import/route.ts Zeilen 117–174
- **Logging:** Inline logImport()-Funktion (Duplikat von import/route.ts), Filename mit `[paperless]`-Prefix
- **Error-Handling:** 401 → Auth-Fehler, 502/503 → API nicht erreichbar, 503 → Config fehlt

### Frontend-Komponente (`src/components/import-zone.tsx`)
- **Config-Check:** POST `/api/paperless/sync` bei Mount, Route gibt `{ configured: false }` zurück wenn Env-Variablen fehlen
- **States:** `isSyncing`, `syncResult`, `syncError`, `paperlessConfigured`
- **Detail-Anzeige:** Scrollbar für viele Dokumente (max-h-48 overflow-y-auto), Color-Coding (grün/orange/rot)

## Nicht-lesen-Liste

- `src/app/api/bons/`, `src/app/api/produkte/`, `src/app/api/statistiken/` — keine Änderungen
- `src/components/bon-*.tsx`, `product-list.tsx`, `statistik-dashboard.tsx` — keine Änderungen
- `tests/PROJ-1-ebon-import.spec.ts` — bereits existierend, Regression-Prüfung nach Impl.

## Tests

### Bestehende Tests (Regression)
- `tests/PROJ-1-ebon-import.spec.ts` — E2E manueller Import. **Keine Änderungen nötig.**

### Neue Tests
| Datei | Typ | Szenarien |
|---|---|---|
| `src/app/api/paperless/sync/sync.test.ts` | Unit (Vitest) ✅ | Config-Check (fehlende Env), Duplikat-Detection, Transaction-Integrity, Logging, Response-Structure |

**E2E-Tests:** Optional (könnten mit gemockter paperless-API hinzugefügt werden, sind aber nicht in diesem Sprint)
