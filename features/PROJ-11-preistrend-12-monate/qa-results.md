# QA Results: PROJ-11 – Preistrend letzte 12 Monate

**Tested:** 2026-04-12
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Feature Spec:** [spec.md](spec.md)
**Context Map:** [context-map.md](context-map.md)

---

## Acceptance Criteria Status

### AC-1: Zeitfenster-Logik
- [x] Trend-Badge berechnet Preisveränderung vom ältesten Kauf der letzten 12 Monate
- [x] Liegt ältester Kauf < 12 Monate zurück: gesamter verfügbarer Zeitraum wird genutzt
- [x] Nur 1 Kauf in letzten 12 Monaten → kein Badge (unit tests + E2E bestätigt)
- [x] Letzter Kauf > 12 Monate zurück → kein Badge (price_data_count = 0 → null)

### AC-2: Anzeige
- [x] Badge zeigt Pfeil und Prozent (Format "↑ 12,3%") – E2E bestätigt
- [x] Tooltip am Badge zeigt Zeitraum – E2E Test 9 bestätigt (Hover → Tooltip sichtbar mit Jahr)
- [x] Farben: rot/grün/grau – unverändertes Verhalten aus PROJ-10

### AC-3: Performance
- [x] API antwortet unter 500ms – E2E Performance-Test bestätigt
- [x] Nur eine SQL-Query (keine N+1) – Code Review bestätigt (Subqueries im SELECT)
- [x] Ladezeit Produktseite < 6s – E2E bestätigt

---

## Edge Cases Status

### EC-1: Alle Käufe am gleichen Tag → 0%-Badge
- [x] Unit Test: Korrekt behandelt (0% Trend)

### EC-2: Produkt zuletzt vor 13 Monaten gekauft → kein Badge
- [x] Unit Test: `price_data_count = 0` → `price_trend_pct = null`

### EC-3: 2 Käufe: erster vor 11 Monaten, zweiter heute
- [x] Unit Test: Normaler Trend auf 11-Monate-Zeitraum

### EC-4: Leergut (Preis ≤ 0) ausgeschlossen
- [x] Unit Test: `price_data_count` zählt nicht Leergut-Positionen

### EC-5: Ältere Käufe außerhalb 12-Monats-Fenster ignoriert
- [x] Unit Test: Trend basiert nur auf Käufen im Fenster (z.B. 100→200→250, nur 200→250 gewertet)

### EC-6: trend_from_date bei genau 1 Kauf im Fenster
- [x] Korrekt: `trend_from_date` kann gesetzt sein, `price_trend_pct` trotzdem null
  - Begründung: `trend_from_date` ist ein DB-Rohwert; das Badge wird nur gezeigt wenn `price_trend_pct != null`

---

## Security Audit

- [x] Keine Authentifizierung erforderlich (lokale Single-User-App, by design)
- [x] SQL Injection: Parameterisierte Queries, kein user input in der neuen Query
- [x] API-Felder: Keine sensiblen Daten exponiert (`trend_last_price_cents` korrekt herausgefiltert)
- [x] Input-Validation: Bestehende Sortier/Filter-Validierung unverändert

---

## Regressions-Check

### PROJ-10 E2E Tests (13 Tests)
- 12 passed, 1 failed
- **Fehler:** "clicking trend badge opens price chart sheet" → `getByRole("dialog", { name: "Preisentwicklung" })`
- **Ursache:** Pre-existing Bug im PROJ-10-Test. Der SheetTitle zeigt immer den Produktnamen, nie den fixen String "Preisentwicklung". Kein Zusammenhang mit PROJ-11.
- **Bewertung:** Kein Regressionsrisiko durch PROJ-11

### Unit Tests (55 Tests)
- 55/55 passed – keine Regression

---

## Bugs Found

### BUG-1: PROJ-10-E2E-Test-Bug (pre-existing, nicht durch PROJ-11 eingeführt)
- **Severity:** Low (Test-Bug, kein App-Bug)
- **Steps to Reproduce:**
  1. Run `npm run test:e2e tests/PROJ-10-preistrend-indikator.spec.ts`
  2. Test "clicking trend badge opens price chart sheet" schlägt fehl
  3. Expected: `getByRole("dialog", { name: "Preisentwicklung" })` sichtbar
  4. Actual: Dialog-Titel zeigt Produktnamen (z.B. "GOUDA"), nicht "Preisentwicklung"
- **Empfehlung:** PROJ-10-Test anpassen auf `page.locator('[role="dialog"]')` (wie in PROJ-11 korrekt gemacht)
- **Priority:** Fix in next sprint

---

## Test Results Summary

### Unit Tests (Vitest)
| Test File | Tests | Ergebnis |
|---|---|---|
| `produkte-preistrend-12m.test.ts` (PROJ-11 neu) | 7 | ✅ alle grün |
| `produkte-preistrend.test.ts` (PROJ-10) | 8 | ✅ alle grün |
| alle anderen | 40 | ✅ alle grün |
| **Gesamt** | **55** | **✅ 55/55** |

### E2E Tests (Playwright)
| Test Suite | Tests | Ergebnis |
|---|---|---|
| `PROJ-11-preistrend-12-monate.spec.ts` (neu) | 15 | ✅ 15/15 |
| `PROJ-10-preistrend-indikator.spec.ts` (Regression) | 13 | ⚠️ 12/13 (1 pre-existing Test-Bug) |

---

## Summary

| Metric | Result |
|---|---|
| Acceptance Criteria | 10 / 10 passed |
| Edge Cases | 6 / 6 handled |
| Bugs Found | 1 (pre-existing Test-Bug, Low severity) |
| Security | Pass – keine Findings |
| Unit Tests | 55/55 |
| E2E Tests (PROJ-11) | 15/15 |
| Production Ready | **YES** |
| Recommendation | Deploy |
