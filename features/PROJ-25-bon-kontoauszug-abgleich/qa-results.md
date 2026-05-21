# QA Results: PROJ-25 — Bon-Kontoauszug Abgleich & Visualisierung

**QA Date:** 2026-05-21  
**QA Status:** Approved  
**Tester:** Claude QA Engineer

---

## Summary

| | Count |
|---|---|
| Acceptance Criteria | 10 / 10 passed ✅ (after fixes) |
| Bugs Found | 5 (1 Critical, 2 Medium, 2 Low) — all fixed |
| Security Issues | None |
| Production Ready | Yes ✅ |

---

## Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Kartenzahlung REWE/Lidl/Kaufland auto-gematcht (±1 Tag + gleicher Betrag) | ✅ Pass |
| 2 | Überweisung mit Händlername korrekt gematcht | ✅ Pass |
| 3 | Gematchter Bon zeigt Badge in Detailansicht | ✅ Pass |
| 4 | Transaktion ohne passenden Bon → virtueller Bon | ✅ Pass |
| 5 | Virtuelle Bons visuell klar unterscheidbar | ✅ Pass |
| 6 | Gesamtausgaben schließt virtuelle Bons ein | ✅ Pass |
| 7 | Manuelle Zuordnung funktioniert | ✅ Pass (nach Fix B1) |
| 8 | Re-Matching: virtueller Bon verschwindet nach echtem Bon-Import | ✅ Pass |
| 9 | Mehrere Kandidaten → pending, kein Auto-Match | ✅ Pass |
| 10 | Manuell zugeordnete Matches bleiben bei erneutem Matching | ✅ Pass |

---

## Bugs Found & Fixed

### B1 — Critical (Fixed) ✅
**File:** `src/app/api/konto/transactions/[id]/assign/route.ts`  
**Problem:** FK-Constraint-Violation beim manuellen Zuordnen einer virtuellen Transaktion.  
`DELETE FROM receipts WHERE id = virtual_id` schlug fehl weil `bank_transactions.matched_receipt_id` noch auf den zu löschenden Datensatz zeigte.  
**Fix:** `matched_receipt_id = NULL` setzen bevor das virtuelle Receipt gelöscht wird.

### B2 — Medium (Fixed) ✅
**File:** `src/lib/konto-matching.ts`  
**Problem:** `sonstige`-Transaktionen wurden auto-gematcht (und ggf. als virtueller Bon angelegt), obwohl die Spec sagt "Kein Auto-Match, optional manuell zuordnen".  
**Fix:** `sonstige` aus `typ IN (...)` im Matching-Query entfernt.

### B3 — Medium (Fixed) ✅
**File:** `src/components/import-zone.tsx`  
**Problem:** Die Sichtbarkeit des Konto-Paperless-Sync-Buttons hing vom eBon-Paperless-Config-Check ab. Bei gesetztem `PAPERLESS_URL`/`PAPERLESS_TOKEN` aber fehlendem `PAPERLESS_KONTO_DOCUMENT_TYPE_ID` war der Button sichtbar, lieferte aber 503.  
**Fix:** Konto-Paperless-Sync-Section immer anzeigen — Fehlermeldung wird klar im UI angezeigt.

### B4 — Low (Fixed) ✅
**File:** `src/app/api/konto/transactions/[id]/assign/route.ts`  
**Problem:** Kein Check ob der gewählte Bon bereits einer anderen Transaktion zugeordnet ist.  
**Fix:** Server-seitige Validierung: 409 wenn `receipts.bank_transaction_id` bereits auf eine andere Transaktion zeigt.

### B5 — Low (Fixed) ✅
**File:** `src/app/api/bons/route.ts`  
**Problem:** `total_count` in der Bon-Übersicht zählte auch virtuelle Bons, obwohl der Label "Bons" zeigt.  
**Fix:** `total_count` auf `WHERE is_virtual = 0` beschränkt; `total_spent_cents` umfasst weiterhin alle Receipts (inkl. virtuelle).

---

## Tests Run

- `src/lib/konto-matching.test.ts` — 11/11 passed
- `src/app/api/bons/bons-avis-status.test.ts` — 4/4 passed (Regression)

---

## Security Audit

- Assign endpoint: transaction ID and receipt ID validated before mutation ✅
- No SQL injection risk (parameterized queries) ✅
- Virtual bons correctly excluded from clickable detail view ✅
- No sensitive data leaked in API responses ✅
