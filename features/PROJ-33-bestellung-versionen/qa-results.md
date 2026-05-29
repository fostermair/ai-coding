# PROJ-33: QA-Ergebnisse — Mehrere Bestellungen pro Bon

**QA-Datum:** 2026-05-27
**Tester:** Claude QA Engineer
**Status:** APPROVED ✅

---

## Acceptance Criteria — Ergebnisse

| AC | Kriterium | Status |
|----|-----------|--------|
| AC-1 | Mehrere PDFs mit gleicher Bestellnummer importierbar (kein Duplikat-Block) | ✅ PASS |
| AC-2 | Artikelliste im Bon-Detail: Vereinigung aller Bestellartikel, GROUP BY dedupliziert | ✅ PASS |
| AC-3 | PDF-Anzeige: neuestes importiertes PDF (MAX import_log_id) | ✅ PASS |
| AC-4 | Bon-Matching und `has_bestellung`-Flag unverändert | ✅ PASS |
| AC-5 | Paperless-Sync: kein Duplikat-Block per order_number | ✅ PASS |

**Gesamt: 5/5 PASS**

---

## Code Review

### `src/app/api/bestellung/import/route.ts`
- Duplikat-Check (9 Zeilen) korrekt entfernt
- Kein Rückgabe-Pfad mehr mit 409 Conflict
- Restlicher Import-Flow unverändert

### `src/app/api/paperless/bestellung-sync/route.ts`
- Duplikat-Check-Block (12 Zeilen) korrekt entfernt
- `SyncDetail.status` Typ: `"duplicate"` entfernt — TypeScript-Fehler behoben
- `duplicates`-Variable und Response-Feld bleiben (immer 0) — nicht störend

### `src/app/api/bons/[id]/route.ts`
- GROUP BY Query: `article_name, quantity_amount, quantity_unit` — korrekte Deduplizierungs-Dimensionen
- `MIN(id)` als `id` — konsistent mit bestehendem Rückgabe-Typ
- `MIN(unit_price_cents)` / `MIN(total_price_cents)` — bei identischen Artikeln identisch, bei unterschiedlichen Preisen wird der niedrigere gewählt (konservativ, akzeptabel)

### `src/app/api/bons/[id]/bestellung-pdf/route.ts`
- `MAX(bi.import_log_id)` als Subquery — liefert zuverlässig den neuesten Eintrag
- Korrekter JOIN über `import_log.id`

---

## Unit Tests

### Neue Tests (erstellt)

| Datei | Tests | Ergebnis |
|-------|-------|---------|
| `src/app/api/bestellung/import/import.test.ts` | 2 | ✅ 2/2 PASS |
| `src/app/api/bons/bestellung-merge.test.ts` | 6 | ✅ 6/6 PASS |

### Test-Coverage

| Szenario | Test | Ergebnis |
|----------|------|---------|
| Zwei import_log-Einträge mit gleicher order_number erlaubt | import.test.ts | ✅ |
| Alle Roheinträge in DB gespeichert (4 items aus 2 PDFs) | import.test.ts | ✅ |
| Identische Artikel dedupliziert (2 PDFs → 2 Artikel, nicht 4) | bestellung-merge.test.ts | ✅ |
| Neuer Artikel aus 2. PDF in Merge-Liste | bestellung-merge.test.ts | ✅ |
| Stornierter Artikel aus 1. PDF bleibt erhalten | bestellung-merge.test.ts | ✅ |
| Erster Import: verhält sich wie bisher | bestellung-merge.test.ts | ✅ |
| PDF-Route: neuestes PDF geliefert | bestellung-merge.test.ts | ✅ |
| PDF-Route: einziger Eintrag wird geliefert | bestellung-merge.test.ts | ✅ |

### Regression-Tests

| Datei | Ergebnis |
|-------|---------|
| `src/app/api/bons/bons-avis-status.test.ts` | ✅ 4/4 PASS |

---

## Edge Cases

| Edge Case | Verhalten | Bewertung |
|-----------|-----------|-----------|
| Gleicher Artikel, unterschiedliche Preise in zwei PDFs | `MIN(unit_price_cents)` wird gewählt | ✅ Akzeptabel (konservativ) |
| Stornierter Artikel: bleibt in Merge-Basis | Korrekt — Union aller Einträge | ✅ Spec-konform |
| Drei oder mehr PDFs gleicher Bestellnr. | GROUP BY skaliert beliebig | ✅ |
| `duplicates`-Counter in Paperless-Response | Bleibt im Response (immer 0) | ⚠️ Low: irreführendes Response-Feld, aber nicht kritisch |

---

## Security Audit

| Prüfpunkt | Befund |
|-----------|--------|
| SQL Injection | Parameterized Queries in allen geänderten Routen ✅ |
| Unbegrenzte Imports gleicher Bestellnr. | Akzeptiert per Design (Spec) — kein Angreifer-Vektor bei lokaler App ✅ |
| Disk-Speicherverbrauch | Jeder Import schreibt eine neue PDF-Datei — bei sehr vielen Reimports wächst `data/bestellungen/`. Kein Blocker, da lokale App. ✅ |

---

## Bugs

### Low: `duplicates`-Feld in Paperless-Sync Response

- **Schweregrad:** Low
- **Beschreibung:** Das `duplicates`-Feld und die `duplicates`-Variable in `paperless/bestellung-sync/route.ts` bleiben erhalten, werden aber nie erhöht (immer 0 im Response).
- **Auswirkung:** Response enthält ein nutzloses Feld, das Nutzer ggf. verwirrt wenn sie die API direkt aufrufen.
- **Reproduktion:** Paperless-Sync ausführen, Response prüfen.
- **Empfehlung:** `duplicates`-Feld und Variable in einem Folge-Cleanup entfernen.

---

## Produktionsreife-Entscheidung

**READY ✅**

- Keine Critical oder High Bugs
- 1 Low Bug (nicht blockierend)
- 8 neue Tests, 4 Regression-Tests — alle grün
- TypeScript kompiliert fehlerfrei
