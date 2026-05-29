# PROJ-35: Context Map — PDF-Inline-Ansicht in Import-History-Tabs

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/components/import-history-table.tsx` | Erweitert | Row-Click + Inline-PDF-Panel + InlinePdf-Komponente hinzugefügt |
| `src/app/api/import/pdf/route.ts` | Neu erstellt | Einheitlicher PDF-Serving-Endpunkt für alle 4 Import-Typen |
| `src/app/api/bons/[id]/pdf/route.ts` | Nur lesen | Pattern für Paperless PDF-Proxy (fetchFromPaperless-Pattern) |
| `src/app/api/bons/[id]/bestellung-pdf/route.ts` | Nur lesen | Pattern für lokales PDF-Serving (fs.readFileSync) |
| `src/lib/db.ts` | Nur lesen | DB-Client, Tabellen `receipts`, `import_log`, `bank_statement_log` |
| `src/components/import-tabs.tsx` | Nur lesen | Kein Änderungsbedarf |

## Kritische Typen

```typescript
type HistoryType = "ebon" | "avis" | "bestellung" | "kontoauszug"

// GET /api/import/pdf?type={type}&id={id}
// Returns: application/pdf OR { error: string } with 4xx/5xx status

// Datenbankquellen pro Typ:
// ebon        → receipts.paperless_doc_id WHERE id = {id}
// avis        → import_log.paperless_doc_id WHERE id = {id}
// bestellung  → import_log.pdf_path (bevorzugt) ODER import_log.paperless_doc_id WHERE id = {id}
// kontoauszug → bank_statement_log.paperless_doc_id WHERE id = {id}
```

## Nicht-lesen-Liste

- `src/app/api/paperless/` — Sync-Endpunkte, nicht relevant
- `src/app/api/bons/` (außer pdf-Patterns) — Bon-Detail-Logik, nicht relevant
- `src/components/bon-detail.tsx` — Bon-Detail-UI, nicht relevant
- `src/app/api/konto/` — Kontoauszug-Import, nicht relevant

## Tests

### Bestehende Tests
*(keine spezifischen Tests für import-history-table bekannt)*

### Neue Tests
| Datei | Typ |
|-------|-----|
| `src/app/api/import/pdf/route.test.ts` | Unit — Endpunkt-Logik für alle 4 Typen |
