# PROJ-28: Kontext-Karte

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/bon-detail.tsx` | Erweitern | Toggle-State + PDF-Viewer-Bereich + Buttons |
| `src/app/api/bons/[id]/pdf/route.ts` | Neu erstellen | eBon PDF Proxy-Endpunkt (Paperless-Download) |
| `src/app/api/bons/[id]/avis-pdf/route.ts` | Neu erstellen | AVIS PDF Proxy-Endpunkt |
| `src/app/api/paperless/avis-sync/route.ts` | Erweitern | Speichern von paperless_doc_id beim AVIS-Import |
| `src/lib/db.ts` | Erweitern | Migration: import_log.paperless_doc_id Spalte |
| `src/app/api/bons/[id]/sync/route.ts` | Nur lesen | Paperless-Download-Pattern zum Referenzieren |
| `src/app/api/bons/[id]/route.ts` | Nur lesen | Bon-Detail API (paperless_doc_id wird bereits zurückgegeben) |

## Kritische Typen & Interfaces

Aus `bon-detail.tsx`:

```typescript
interface BonDetail {
  id: number
  filename: string
  store_name: string
  store_address: string
  store_uid: string
  market_nr: string
  receipt_nr: string
  receipt_date: string
  receipt_time: string
  payment_method: string
  total_amount_cents: number
  needs_reparse: number
  paperless_doc_id: number | null  // <- Schlüssel für PDF-Button Gate
  store_chain?: string
  has_avis: boolean  // <- Gate für AVIS-Button
  is_virtual?: number
  bank_transaction_id?: number | null
  items: ReceiptItem[]
}
```

## Datenbank-Schema

Aus `src/lib/db.ts`:

**`receipts`-Tabelle (relevant):**
- `id INTEGER PRIMARY KEY`
- `paperless_doc_id INTEGER` (nullable, existiert bereits via Migration Zeile 147-149)
- `store_chain TEXT`
- Alle anderen Standard-Spalten

**`import_log`-Tabelle (zu migrieren):**
```
CREATE TABLE IF NOT EXISTS import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,
  status      TEXT NOT NULL,
  message     TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Nach Migration wird hinzugefügt:
- `paperless_doc_id INTEGER` (nullable)

**`avis_matches`-Tabelle (Referenz):**
- `id INTEGER PRIMARY KEY`
- `receipt_id INTEGER` — verbindet zu receipts
- `import_log_id INTEGER` — verbindet zu import_log
- `confidence INTEGER` — wird verwendet, um den besten Match zu finden

## Umgebungsvariablen

Bereits vorhanden und verwendet in bestehenden Paperless-Routes:
- `PAPERLESS_URL` — Basis-URL des Paperless-Servers
- `PAPERLESS_TOKEN` — Authentifizierungs-Token

Diese sind in `src/app/api/paperless/sync/route.ts` und `src/app/api/bons/[id]/sync/route.ts` dokumentiert.

## Paperless-API-Pattern

Aus `src/app/api/bons/[id]/sync/route.ts` (Zeilen ca. 47-51):

```typescript
fetch(`${baseUrl}/api/documents/${receipt.paperless_doc_id}/download/`, {
  headers: {
    Authorization: `Token ${token}`,
  },
})
```

Wird für beide neuen Routes wiederverwendet.

## Nicht-lesen-Liste

- `src/components/bon-overview.tsx` — Bon-Liste (kein Touch)
- `src/app/api/products/` — Produktmanagement (kein Touch)
- `src/components/ui/` — shadcn Komponenten (nur Referenz, nicht verändern)
- Alle PROJ-1 bis PROJ-27 Feature-Codes (außer Referenzen zu bestehenden APIs)

## Tests

### Bestehende Tests

Keine bestehenden Tests für `bon-detail.tsx` gefunden (grep: `bon-detail.test.*`, `test-bon-detail.*` nicht vorhanden).

Falls Tests für ähnliche Komponenten existieren (z. B. product-list Tests), als Muster verwenden.

### Neue Tests

**E2E-Test (Playwright):**
- `tests/e2e/bon-detail-pdf.spec.ts` — NEW
  - Navigiere zu einem Bon mit `paperless_doc_id`
  - Verifiziere "PDF anzeigen"-Button ist sichtbar
  - Klick → iframe lädt PDF
  - Verifiziere `<iframe>` src Attribut ist `/api/bons/{id}/pdf`
  - Zweiter Klick → iframe ist ausgeblendet (Toggle)
  - Navigiere zu Bon ohne `paperless_doc_id` → Button nicht sichtbar

**Unit-Test (falls relevant):**
- Wenn PDF-Viewer Logik in Hook ausgelagert wird (z. B. `usePdfViewer`): `src/hooks/usePdfViewer.test.ts`
  - Toggle-State korrekt
  - API-Error-Handling

## Notizen

- **Bon-ID-zentrischer API-Ansatz:** `GET /api/bons/[id]/avis-pdf` ermittelt intern den besten AVIS-Match (höchster Confidence-Score), statt dass Frontend eine `import_log_id` übergeben muss. Vereinfacht die Schnittstelle.
- **iframe vs. embed:** `<iframe>` ist sicher, blockiert Paperless-Token-Leak, unterstützt Browser-PDF-Rendering.
- **Fehlerbehandlung:** Wenn `paperless_doc_id` vorhanden, aber Paperless nicht erreichbar (502), sollte ein Fehler im Viewer angezeigt werden (z. B. leerer iframe + Fehlermeldung unter dem Button).
