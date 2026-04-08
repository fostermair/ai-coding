# PROJ-1: eBon Import & Parser

## Status: Approved
**Created:** 2026-04-07
**Last Updated:** 2026-04-08

## Implementation Notes (Frontend)
- Globale Navigation (`src/components/nav.tsx`) mit aktiver Link-Hervorhebung
- Import-Seite (`src/app/import/page.tsx`) mit `ImportZone` Client-Komponente
- Drag & Drop nativ (HTML5) ohne externe Library implementiert
- Upload-Queue mit Status-Machine: pending → uploading → success/duplicate/error
- Placeholder-Seiten für `/`, `/produkte`, `/statistiken` erstellt

## Implementation Notes (Backend)
- `src/lib/db.ts`: SQLite-Singleton via `better-sqlite3`, WAL-Modus, 5 Tabellen + Indizes
- `src/lib/parser/rewe.ts`: 3-Phasen-Parser (Header/Items/Footer), alle eBon-Typen
  - Produkte, Rabatte, Mengenzeilen, Pfand, Leergut, Konzessionärsartikel (X01)
  - Geldbeträge als Integer-Cents gespeichert
- `src/app/api/import/route.ts`: POST-Handler mit Duplikat-Erkennung + Transaktions-Insert
- `src/lib/parser/rewe.test.ts`: 19 Unit-Tests – alle bestanden
- Pakete: `better-sqlite3`, `pdf-parse@1.1.1`

## Bug Fixes (2026-04-08)
- **BUG-1 (Critical):** Downgraded `pdf-parse` from v2.4.5 to v1.1.1 — v2 has incompatible class-based API, v1 function API matches the code
- **BUG-2 (High):** Added `exclude: ['**/tests/**']` to `vitest.config.ts` to prevent Vitest from picking up Playwright spec files
- **BUG-3 (High):** Removed `@types/pdf-parse` (v1 types incompatible with v2 package; no longer needed with v1.1.1)
- **BUG-5 (Medium):** Installed WebKit browser for Playwright (`npx playwright install webkit`)
- **BUG-6 (Medium):** Added 10 MB file size limit on PDF upload in `route.ts`
- **E2E tests:** Fixed flaky Mobile Safari tests caused by shared DB across parallel test workers

## Dependencies
- None (Fundament aller anderen Features)

## User Stories
- Als Nutzer möchte ich eine PDF-Datei per Drag & Drop hochladen können, damit der Bon automatisch verarbeitet wird
- Als Nutzer möchte ich mehrere PDFs gleichzeitig hochladen können, damit ich Bons in Batches importieren kann
- Als Nutzer möchte ich sehen, ob ein Import erfolgreich war oder fehlgeschlagen ist, damit ich Probleme erkennen kann
- Als Nutzer möchte ich, dass bereits importierte Bons nicht doppelt gespeichert werden, damit meine Daten konsistent bleiben
- Als Nutzer möchte ich nach dem Import eine Zusammenfassung sehen (Datum, Markt, Anzahl Artikel, Summe), damit ich den Bon auf Anhieb identifizieren kann

## Acceptance Criteria
- [ ] PDF-Datei kann per Drag & Drop oder Dateiauswahl in der Web-App hochgeladen werden
- [ ] Parser extrahiert korrekt: Marktname, Adresse, UID-Nr., Datum, Uhrzeit, Bon-Nr., Markt-Nr., Zahlungsmethode
- [ ] Parser extrahiert für jede Produktzeile: Produktname (roh), Einzelpreis, Menge (Stk), Gesamtpreis, MwSt-Code (A/B), Rabatt-Flag (*)
- [ ] Mengenzeilen ("2 Stk x 1,79") werden korrekt dem übergeordneten Produkt zugeordnet
- [ ] Rabattzeilen (negative Beträge mit Aktionsbeschreibung) werden als Rabatt-Datensatz gespeichert und dem Produkt zugeordnet
- [ ] Pfand-Zeilen (PFAND) und Leergut-Zeilen (LEERG.) werden als separate Transaktionstypen gespeichert
- [ ] Duplikat-Erkennung: Bon mit gleicher Kombination aus Bon-Nr. + Markt-Nr. + Datum wird nicht erneut importiert
- [ ] Bei Duplikat: Nutzer erhält klare Fehlermeldung "Bon bereits importiert (Bon-Nr. XXXX, Datum DD.MM.YYYY)"
- [ ] Alle Daten werden in SQLite gespeichert (Datei: `data/ebon.db`)
- [ ] Alle 3 Beispiel-eBons (REWE-ebon1.pdf, REWE-ebon2.pdf, REWE-eBon3.pdf) werden korrekt importiert

## Edge Cases
- PDF enthält keinen maschinenlesbaren Text (gescannt) → Fehlermeldung: "PDF enthält keinen lesbaren Text"
- PDF ist beschädigt oder kein REWE-Format → Fehlermeldung: "Format nicht erkannt"
- Produktname enthält Sonderzeichen oder Umlaute → korrekt als UTF-8 gespeichert
- Bon mit negativer Gesamtsumme (Rückgabe vieler Leergut-Flaschen wie in ebon1.pdf: -38,29 EUR) → korrekt als negative Summe gespeichert
- Konzessionär-Artikel (X01 in ebon2.pdf, Fleischerei) → als eigenständiger Block mit separatem Anbieter gespeichert
- Mehrwertsteuer-Kategorien: A=19% (Getränkemarkt-Produkte) und B=7% (Lebensmittel) → beide korrekt zugeordnet

## Technical Requirements
- PDF-Parsing via `pdf-parse` oder `pdfjs-dist` (rein text-basiert, kein OCR)
- SQLite via `better-sqlite3` (synchron, serverseitig in Next.js API Route)
- Datenbankdatei: `data/ebon.db` (im Projekt-Root, via .gitignore ausgeschlossen)
- API Route: `POST /api/import` (multipart/form-data)
- Parser-Logik in separatem Modul: `src/lib/parser/rewe.ts`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Designed:** 2026-04-07

> Diese Architektur etabliert die gesamte geteilte Infrastruktur für alle Features des Projekts (DB, Parser, API-Grundstruktur).

---

### App-Navigation (Gesamtprojekt)

```
Layout (Navigation oben)
+-- / → Bon-Übersicht (PROJ-2)
+-- /import → eBon Upload (PROJ-1)
+-- /produkte → Produktdatenbank & Aliases (PROJ-3)
+-- /statistiken → Statistik-Dashboard (PROJ-5)
```

---

### Komponenten-Struktur (PROJ-1: Import-Seite)

```
/import Seite
+-- ImportZone (Drag-&-Drop-Bereich)
|   +-- Dateiauswahl-Button (Fallback)
|   +-- Drag-Overlay (visuelles Feedback beim Drüberziehen)
+-- ImportQueue (Liste der zu verarbeitenden Dateien)
|   +-- ImportQueueItem (pro Datei)
|       +-- Dateiname
|       +-- Status-Badge (Wartend / Verarbeitung / Erfolg / Fehler / Duplikat)
|       +-- Ergebnis-Zusammenfassung (Datum, Markt, Anzahl Artikel, Summe)
+-- Fehlermeldung (wenn Format nicht erkannt)
```

---

### Datenmodell (SQLite – Datei: `data/ebon.db`)

**Tabelle: `receipts` (ein Eintrag pro Kassenbon)**
- `id` – eindeutige interne ID
- `filename` – Original-Dateiname der PDF
- `store_name` – Name des Markts (z.B. "Rewe Markt Saal")
- `store_address` – Adresse des Markts
- `store_uid` – Umsatzsteuer-ID des Markts
- `market_nr` – Markt-Nummer (aus TSE-Daten, z.B. 6857)
- `receipt_nr` – Bon-Nummer (z.B. 4546)
- `receipt_date` – Datum des Einkaufs (YYYY-MM-DD)
- `receipt_time` – Uhrzeit des Einkaufs (HH:MM)
- `payment_method` – Zahlungsmethode (BAR / Mastercard / VISA / etc.)
- `total_amount_cents` – Gesamtbetrag in Cent (Integer, verhindert Rundungsfehler)
- `imported_at` – Zeitstempel des Imports

**Tabelle: `receipt_items` (eine Zeile pro Produktposition)**
- `id` – eindeutige interne ID
- `receipt_id` – Verweis auf `receipts.id`
- `raw_name` – Produktname exakt wie im Bon (z.B. "HAEHNCHENFL.W.")
- `item_type` – Art des Eintrags: `product` / `pfand` / `leergut` / `concession`
- `quantity` – Menge (Standard: 1; bei "2 Stk x 1,79" → 2)
- `unit_price_cents` – Einzelpreis in Cent
- `total_price_cents` – Gesamtpreis in Cent (Menge × Einzelpreis)
- `tax_code` – MwSt-Kategorie: A (19%) oder B (7%)
- `bonus_excluded` – true wenn mit `*` markiert (kein Bonus/Rabatt)
- `concessionaire_code` – Konzessionärs-Code (z.B. "X01"), sonst leer
- `position` – Reihenfolge im Bon (für korrekte Detailansicht)

**Tabelle: `item_discounts` (Rabatte, die einem Produkt zugeordnet sind)**
- `id`
- `receipt_item_id` – Verweis auf `receipt_items.id`
- `description` – Rabattbezeichnung (z.B. "Weihn. Sueßwaren 50%")
- `amount_cents` – Rabattbetrag in Cent (negativer Wert)
- `tax_code` – MwSt-Code des Rabatts

**Tabelle: `product_aliases` (Nutzer-definierte Lesbar-Namen)**
- `raw_name` – Rohname aus Bon (Primärschlüssel)
- `alias` – lesbarer Name (z.B. "Hähnchen-Filetsteak")
- `updated_at` – letztes Änderungsdatum

**Tabelle: `import_log` (Protokoll jedes Import-Versuchs)**
- `id`
- `filename` – Dateiname der PDF
- `status` – `success` / `duplicate` / `error`
- `message` – Detailmeldung (z.B. "Bon-Nr. 4546 bereits importiert")
- `imported_at` – Zeitstempel

---

### Parser-Logik (REWE eBon)

Der Parser liest den PDF-Text Zeile für Zeile und durchläuft 3 Phasen:

**Phase 1 – Header:** Marktname, Adresse, UID-Nummer (bis zur Trennlinie `***`)

**Phase 2 – Produktzeilen** (zwischen Header und `SUMME`):
- Normale Produktzeile: `PRODUKTNAME    PREIS B` → Name, Preis, MwSt
- Mengenzeile direkt darunter: `2 Stk x 1,79` → wird dem letzten Produkt zugeordnet
- Rabattzeile: eingerückte Zeile mit negativem Betrag → wird als Discount gespeichert
- Pfand-Zeile: Name beginnt mit `PFAND` → item_type = pfand
- Leergut-Zeile: Name beginnt mit `LEERG.` → item_type = leergut

**Phase 3 – Footer:** `SUMME`, Zahlungsmethode, MwSt-Tabelle, TSE-Daten (Datum, Uhrzeit, Bon-Nr., Markt-Nr.)

**Duplikat-Erkennung:** Nach dem Parsen wird geprüft, ob ein Eintrag mit gleicher `receipt_nr` + `market_nr` + `receipt_date` bereits in der DB existiert.

---

### API-Routen (PROJ-1)

```
POST /api/import
  → Nimmt multipart/form-data mit einer oder mehreren PDF-Dateien entgegen
  → Für jede PDF: Text extrahieren → Parser aufrufen → DB speichern
  → Antwortet mit Array von Ergebnissen (success/duplicate/error pro Datei)
```

---

### Tech-Entscheidungen

| Entscheidung | Gewählt | Begründung |
|---|---|---|
| Datenbank | `better-sqlite3` | Synchrone API, kein separater Server, eine portierbare `.db`-Datei, ideal für Single-User-Local-App |
| Geldbeträge | Integer (Cent) | Kein Rundungsfehler bei Dezimalzahlen (0,1 + 0,2 ≠ 0,3 in Float) |
| PDF-Parsing | `pdf-parse` | Einfachste API für reine Textextraktion, kein OCR nötig |
| Datei-Upload | Native Next.js `FormData` | Kein extra Upload-Middleware nötig im App Router |
| Drag & Drop UI | `react-dropzone` | Etablierte Library, einfache Integration, Accessibility-ready |

---

### Neue Abhängigkeiten (npm)

| Paket | Zweck |
|---|---|
| `better-sqlite3` | SQLite-Datenbank-Client (serverseitig) |
| `@types/better-sqlite3` | TypeScript-Typen |
| `pdf-parse` | PDF-Text-Extraktion |
| `react-dropzone` | Drag-&-Drop-Dateiupload-UI |

## QA Test Results

**Tested:** 2026-04-08 (re-run after bug fixes)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: PDF upload via Drag & Drop or file selection
- [x] Drop zone renders with correct instructions ("PDFs hier ablegen")
- [x] File input accepts `.pdf` with `multiple` attribute
- [x] Click-to-select triggers file dialog
- [x] E2E verified on Chromium and Mobile Safari

#### AC-2: Parser extracts header data (Marktname, Adresse, UID, Datum, Uhrzeit, Bon-Nr., Markt-Nr., Zahlungsmethode)
- [x] Unit tests pass for all 3 eBon variants (ebon1, ebon2, ebon3)
- [x] Store name, UID, receipt date/time, Bon-Nr., Markt-Nr., payment method all extracted correctly
- [x] E2E verified with real PDFs: summary shows date, store, item count, total

#### AC-3: Parser extracts product lines (name, price, quantity, tax code, bonus flag)
- [x] 19 unit tests pass covering products, quantities, tax codes, bonus flags
- [x] E2E verified with real PDF imports

#### AC-4: Quantity lines ("2 Stk x 1,79") assigned to parent product
- [x] Unit test verifies GOUDA GER. 48%: quantity=2, unitPriceCents=179, totalPriceCents=358
- [x] Unit test verifies APPLE-CHERRY: quantity=2, unitPriceCents=249
- [x] Unit test verifies LEERGUT EINWEG: quantity=63, unitPriceCents=25

#### AC-5: Discount lines (negative amounts) stored and assigned to product
- [x] Unit test verifies "Weihn. Sueßwaren 50%" discount: amountCents=-280 on GRAND RAFFEALLO

#### AC-6: PFAND and LEERGUT as separate transaction types
- [x] PFAND items parsed as `itemType: "pfand"`, positive amounts, bonusExcluded=true
- [x] LEERG. items parsed as `itemType: "leergut"`, negative amounts

#### AC-7: Duplicate detection (Bon-Nr. + Markt-Nr. + Datum)
- [x] Code review confirms SELECT check before INSERT
- [x] DB index `idx_receipts_duplicate` exists for performance
- [x] E2E verified: second import shows "Duplikat" badge

#### AC-8: Duplicate error message with Bon-Nr. and Datum
- [x] E2E verified: "Bon bereits importiert (Bon-Nr. XXXX, Datum DD.MM.YYYY)" shown
- [x] E2E test confirms Bon-Nr. text visible in error message

#### AC-9: Data stored in SQLite (`data/ebon.db`)
- [x] DB schema correct: 5 tables (receipts, receipt_items, item_discounts, product_aliases, import_log)
- [x] WAL mode enabled, foreign keys ON
- [x] Auto-creates `data/` directory
- [x] E2E verified: successful imports persist (duplicates detected after reload)

#### AC-10: All 3 example eBons import correctly
- [x] REWE-ebon1.pdf imports successfully (negative total -38,29 EUR)
- [x] REWE-ebon2.pdf imports successfully (Mastercard, concession items)
- [x] REWE-eBon3.pdf imports successfully (Getränkemarkt, PFAND, VISA)

### Edge Cases Status

#### EC-1: PDF without machine-readable text
- [x] Code check: text < 50 chars → "PDF enthält keinen lesbaren Text" (422)

#### EC-2: Damaged or non-REWE PDF
- [x] Parser throws "Format nicht erkannt" when no EUR/SUMME markers found
- [x] Fake PDF test file triggers "Fehler" badge in E2E (Chromium + Safari)

#### EC-3: Product names with Umlaute/special chars
- [x] UTF-8 handling confirmed in unit tests (Sueßwaren, HÄHNCHEN etc.)

#### EC-4: Negative total (Leergut Rückgabe, ebon1: -38,29 EUR)
- [x] Unit test confirms totalAmountCents=-3829
- [x] E2E verified on Chromium

#### EC-5: Concession articles (X01, Fleischerei)
- [x] Unit test confirms FRISCHFLEISCH parsed as concession with code X01

#### EC-6: VAT categories A=19% and B=7%
- [x] Unit tests verify both tax codes across all 3 eBon variants

#### EC-7: File size limit (added in bug fix)
- [x] Files > 10 MB rejected with "PDF-Datei ist zu groß (max. 10 MB)"

### Security Audit Results

- [x] SQL injection: All queries use parameterized statements (better-sqlite3 prepared statements)
- [x] XSS: React escapes all output by default; error messages rendered as text nodes
- [x] Path traversal: Uploaded filenames stored in DB only, never used for file system operations
- [x] No secrets exposed: No API keys, tokens, or credentials in source code
- [x] File size limit: 10 MB max enforced in API route
- [x] No auth needed (single-user local app, as designed)
- [x] No rate limiting needed (local app)
- **Remaining (Low):** No UNIQUE constraint on duplicate key — theoretical race condition under concurrent uploads (acceptable for single-user local app)

### Automated Test Results

#### Vitest (Unit Tests)
- **19/19 parser unit tests PASS** (rewe.test.ts)

#### Playwright (E2E Tests) — Chromium (16 tests)
- [x] All 16 tests PASS

#### Playwright (E2E Tests) — Mobile Safari (16 tests)
- [x] All 16 tests PASS

**Total: 32/32 E2E tests PASS, 19/19 unit tests PASS**

### Previously Found Bugs (all fixed)

| Bug | Severity | Status |
|-----|----------|--------|
| BUG-1: pdf-parse v2.x API incompatible | Critical | FIXED (downgraded to v1.1.1) |
| BUG-2: Vitest picks up Playwright files | High | FIXED (added exclude) |
| BUG-3: @types/pdf-parse mismatch | High | FIXED (removed package) |
| BUG-4: E2E import tests fail | High | FIXED (resolved with BUG-1) |
| BUG-5: WebKit not installed | Medium | FIXED (installed) |
| BUG-6: No file size limit | Medium | FIXED (10 MB limit added) |
| BUG-7: Spec status mismatch | Low | FIXED |
| BUG-8: No UNIQUE constraint | Low | ACCEPTED (single-user app) |

### Summary
- **Acceptance Criteria:** 10/10 passed
- **Edge Cases:** 7/7 passed
- **Bugs Found:** 8 total — 7 fixed, 1 accepted (Low)
- **Security:** No critical or high security issues
- **Production Ready:** **YES**
- **Recommendation:** Deploy

## Deployment
_To be added by /deploy_
