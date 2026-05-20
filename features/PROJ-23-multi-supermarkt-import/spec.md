# PROJ-23: Multi-Supermarkt eBon Import (Lidl & Kaufland)

| Feld | Wert |
|------|------|
| **Status** | Approved |
| **Priority** | P1 |
| **Acceptance Criteria** | 13 ✓ |
| **Created** | 2026-05-20 |
| **Completed** | 2026-05-20 |

---

## Overview

Erweiterung des Paperless-Imports um Lidl und Kaufland eBons. Bisher unterstützt die App nur REWE eBons. Mit diesem Feature können Nutzer auch Lidl und Kaufland Kassenbons aus Paperless-ngx importieren. Die App erkennt anhand des PDF-Inhalts, welcher Kette der Bon gehört, und speichert diese Information. In der UI wird ein farbiger Text-Badge die Kette anzeigen. AVIS-Matching gibt es weiterhin nur für REWE.

---

## User Stories

1. **US-1:** Als Nutzer möchte ich Lidl eBons aus Paperless importieren, damit meine Lidl-Einkäufe in der App sichtbar sind.
2. **US-2:** Als Nutzer möchte ich Kaufland eBons aus Paperless importieren, damit meine Kaufland-Einkäufe erfasst werden.
3. **US-3:** Als Nutzer möchte ich in der Bon-Liste auf einen Blick sehen, von welcher Kette (REWE, Lidl, Kaufland) ein Bon stammt.
4. **US-4:** Als Nutzer möchte ich keine AVIS-Funktionen für Lidl/Kaufland Bons sehen, da es dafür keinen AVIS-Import gibt.

---

## Acceptance Criteria

### AC-1: Lidl Import via Paperless
- [ ] Lidl eBons werden über `POST /api/paperless/sync` importiert
- Voraussetzung: Env-Var `PAPERLESS_LIDL_CORRESPONDENT_ID` ist gesetzt
- Fehlt die Env-Var, werden Lidl-Bons nicht importiert (kein Fehler)

### AC-2: Kaufland Import via Paperless
- [ ] Kaufland eBons werden über `POST /api/paperless/sync` importiert
- Voraussetzung: Env-Var `PAPERLESS_KAUFLAND_CORRESPONDENT_ID` ist gesetzt
- Fehlt die Env-Var, werden Kaufland-Bons nicht importiert (kein Fehler)

### AC-3: Lidl Parser – Produktpositionen
- [ ] Lidl-Positionen werden korrekt geparst
- Format: `Produktname | Einzelpreis x Menge | Gesamtpreis | Steuercode (A/B)`
- Beispiel: `Heidelbeeren 3,99 x 2 7,98 A`
- Menge aus Format `N x Preis` extrahieren
- Steuercode ist Suffix nach Gesamtpreis (A=7%, B=7% oder A=19%, B=19%)

### AC-4: Kaufland Parser – Produktpositionen
- [ ] Kaufland-Positionen werden korrekt geparst
- Format kann mehrzeilig sein:
  - Produktname auf Zeile 1
  - Menge/Preis auf Zeile 2 (z.B. `2 * 0,69 1,38 B`)
- Gewichtsmengen erkennen: `1,190 kg`
- Steuercode ist Suffix nach Gesamtpreis (A/B)

### AC-5: Rabatte erkennen
- [ ] Lidl: Rabatte als „Preisvorteil -X,XX" erkennen und als `discount` Eintrag speichern
- [ ] Kaufland: Rabatte als „K Card Rabatt -X,XX" erkennen und als `discount` Eintrag speichern
- Rabatte sind assoziiert mit der vorherigen Produktposition

### AC-6: Pfand & Leergut
- [ ] Positionen mit „Pfandartikel" als `itemType = "pfand"` speichern
- [ ] Positionen mit „Leergut" als `itemType = "leergut"` speichern
- Beide Typen in Detailansicht separat angezeigt (wie bei REWE)

### AC-7: Duplikat-Erkennung
- [ ] Lidl: Duplikat-Schlüssel `(marketNr + receiptNr + receiptDate)`
- Beispiel: `1812 + 302127 + 31.01.2026`
- [ ] Kaufland: Duplikat-Schlüssel `(marketNr + receiptNr + receiptDate)`
- Beispiel: `1663 + 59962 + 24.01.2026`
- Existiert bereits, wird als Duplikat erkannt (wie REWE)

### AC-8: Store-Chain in Datenbank
- [ ] Ein `store_chain`-Wert wird mit jedem Bon gespeichert
- Mögliche Werte: `"rewe"` (default) / `"lidl"` / `"kaufland"`
- Datenbank: Neue Spalte `store_chain TEXT DEFAULT 'rewe'` in Tabelle `receipts`
- Bei bestehenden REWE-Bons: `store_chain = 'rewe'` (Backfill via Migration)

### AC-9: Store-Badge in Bon-Liste
- [ ] Neue Spalte „Kette" in der Bon-Übersicht, zeigt farbiges Text-Badge
- Badge-Styling:
  - REWE: roter Text/Hintergrund
  - Lidl: gelb/blauer Text/Hintergrund
  - Kaufland: schwarz/roter Text/Hintergrund
- Badge zeigt Kettenname: „REWE", „Lidl", „Kaufland"

### AC-10: Store-Badge in Bon-Detail
- [ ] Badge neben dem Store-Namen in der Detail-Ansicht angezeigt
- Gleiche Farben wie in AC-9

### AC-11: AVIS-Elemente für nicht-REWE ausblenden
- [ ] In der Produkttabelle wird die „AVIS"-Spalte nur für REWE-Bons angezeigt
- [ ] AVIS-Status-Badge in der Bon-Liste nur für REWE-Bons
- [ ] Buttons „AVIS neu einlesen" und „Aus Paperless neu einlesen" nur für REWE-Bons

### AC-12: Env-Vars optional
- [ ] `PAPERLESS_REWE_CORRESPONDENT_ID` (bestehend, bleibt unverändert)
- [ ] `PAPERLESS_LIDL_CORRESPONDENT_ID` (neu, optional)
- [ ] `PAPERLESS_KAUFLAND_CORRESPONDENT_ID` (neu, optional)
- Jede kann gesetzt oder leer sein – kein Fehler wenn leer

### AC-13: Import-Response erweitert
- [ ] Der Response von `POST /api/paperless/sync` enthält:
  ```json
  {
    "imported": 5,
    "duplicates": 1,
    "reparsed": 0,
    "errors": 0,
    "byChain": {
      "rewe": { "imported": 2, "duplicates": 0, "errors": 0 },
      "lidl": { "imported": 2, "duplicates": 1, "errors": 0 },
      "kaufland": { "imported": 1, "duplicates": 0, "errors": 0 }
    },
    "details": [...]
  }
  ```

---

## Edge Cases

1. **Mehrzeilige Produktnamen (Kaufland):**
   - Produktname kann über zwei Zeilen gehen
   - Heuristische Zusammenfassung nötig: Zeile ohne Zahlen gehört zum Namen

2. **Leergut mit Rückgabe:**
   - Negative Beträge (z.B. `Leergut Getränke -3,30 A`)
   - Müssen korrekt als Rabatt/Rückgabe erfasst werden

3. **Mehrere Rabatte pro Bon:**
   - Ein Lidl-Bon kann mehrere „Preisvorteil"-Zeilen haben
   - Ein Kaufland-Bon kann mehrere „K Card Rabatt"-Zeilen haben
   - Jeder Rabatt wird separate erfasst

4. **Kaufland ohne K Card:**
   - Bon ohne K Card Rabatte – keine Rabattzeilen, nur Positionen + Summe
   - Parser muss auch dann funktionieren

5. **Gewichtsmengen:**
   - Kaufland: `Bananen 1,190 kg 1,54 B`
   - Menge extrahieren: `1.19` (kg-Einheit speichern)

---

## Out of Scope

- **AVIS-Matching für Lidl/Kaufland:** Nur REWE hat AVIS-Support (kein Datenformat für andere Ketten bekannt)
- **Produktaliase kettenspezifisch:** Aliase gelten weiterhin global (nicht pro Kette)
- **Offizielle Markenlogos:** Nur Text-Badge, keine SVG-Logo-Assets
- **Andere Ketten:** Aldi, Penny, Metro, etc. nicht in v1
- **OCR/Scan-Support:** Nur digitale (textbareTextbare) PDFs

---

## Dependencies

- **Requires PROJ-18:** Paperless-ngx Import Framework (`/api/paperless/sync` Route)
- **Requires PROJ-1:** eBon Import & Parser (DB-Schema, Parser Pattern)
- **Related:** PROJ-2 (Bon-Übersicht), PROJ-3 (Produktdatenbank)

---

## Technical Notes

### Datenbankschema – Migration erforderlich

**Neue Spalte in `receipts`:**
```sql
ALTER TABLE receipts ADD COLUMN store_chain TEXT DEFAULT 'rewe';
CREATE INDEX idx_receipts_store_chain ON receipts(store_chain);
```

**Backfill für existierende Bons:**
```sql
UPDATE receipts SET store_chain = 'rewe' WHERE store_chain IS NULL;
```

### Parser-Architektur

Drei separate Parser-Module:
- `src/lib/parser/rewe.ts` (bestehend)
- `src/lib/parser/lidl.ts` (neu)
- `src/lib/parser/kaufland.ts` (neu)

Jeder exportiert Funktion:
```ts
export interface ParsedReceipt { ... }
export function parseLidlEbon(text: string): ParsedReceipt
export function parseKauflandEbon(text: string): ParsedReceipt
```

Zusätzliches Feld in `ParsedReceipt`:
```ts
storeChain: "rewe" | "lidl" | "kaufland"
```

### Sync-Endpunkt Anpassung

In `src/app/api/paperless/sync/route.ts`:
1. Lese `PAPERLESS_REWE_CORRESPONDENT_ID`, `PAPERLESS_LIDL_CORRESPONDENT_ID`, `PAPERLESS_KAUFLAND_CORRESPONDENT_ID`
2. Für jede Kette: Fetche Docs von entsprechendem Correspondent
3. Text-Extraktion mit `pdf-parse`
4. Dispatch zu passenden Parser basierend auf Kette-Variable
5. Speichern mit `store_chain` Wert

---

## Implementation Notes

### Parser Detection

Parser wird ausgewählt basierend auf Env-Var-Quell, nicht auf PDF-Inhalt. Das ist zuverlässiger und entspricht Paperless-Struktur (separate Correspondents).

### Duplikat-Index

Bestehender Index wird NICHT geändert:
```sql
CREATE UNIQUE INDEX idx_receipts_duplicate ON receipts(receipt_nr, market_nr, receipt_date)
```

Dieser funktioniert für alle Ketten, weil:
- REWE: `market_nr` = Markt-ID (zuverlässig)
- Lidl: `market_nr` = Store-ID (zuverlässig)
- Kaufland: `market_nr` = Filiale-ID (zuverlässig)

### UI-Integration

Komponenten-Updates sind minimal:
- `bon-list.tsx`: Badge-Spalte hinzufügen, AVIS-Spalte konditional
- `bon-detail.tsx`: Badge neben Name, AVIS-Buttons konditional

Keine große Refactoring nötig – bestehende Struktur bleibt.

---

## Test Plan (vom QA Engineer)

- [ ] Lidl-PDF aus Beispielen importieren, alle Produkte und Rabatte korrekt erkannt
- [ ] Kaufland-PDF aus Beispielen importieren, alle Produkte und Rabatte korrekt erkannt
- [ ] REWE-Bons weiterhin korrekt importiert (Regressions-Check)
- [ ] Duplikate werden korrekt erkannt pro Kette
- [ ] Store-Badge erscheint in Liste und Detail für alle Ketten
- [ ] AVIS-UI Elemente nur für REWE sichtbar
- [ ] Env-Vars optional – App startet auch ohne Lidl/Kaufland Vars
