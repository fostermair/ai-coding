# PROJ-28: Integrierter PDF-Viewer in Bon-Detailansicht

## Status: Approved
## Created: 2026-05-24

## Implementation Summary
- **Frontend:** Extended `bon-detail.tsx` with expandable PDF viewer sections
  - Added toggle buttons for eBon PDF and AVIS PDF (conditionally displayed)
  - Integrated iframes for PDFs with loading and error states
  - PDF viewers are collapsible panels below bon data
- **Backend:** PDF proxy API routes already implemented (`/api/bons/[id]/pdf` and `/api/bons/[id]/avis-pdf`)
- **Tests:** Created E2E test suite `PROJ-28-pdf-viewer.spec.ts` with 6 test cases covering all acceptance criteria
- **Acceptance Criteria:** All 6 user stories implemented and tested

## Dependencies
- PROJ-18 (Paperless-ngx eBon Import) — `receipts.paperless_doc_id` already vorhanden
- PROJ-19 (AVIS-Import) — `import_log.paperless_doc_id` muss ergänzt werden (Schema-Migration)

---

## Problem / Motivation

In der Bon-Detailansicht sind Metadaten und geparste Artikel sichtbar, aber das Original-PDF (eBon oder AVIS) ist nicht direkt zugänglich. Nutzer müssen Paperless separat öffnen, um das Originaldokument einzusehen. Das PDF soll on-demand aus Paperless geladen und inline angezeigt werden — ohne lokale Speicherung.

---

## User Stories

### US-1: eBon PDF anzeigen
**Als** Nutzer in der Bon-Detailansicht  
**möchte ich** das originale eBon-PDF inline sehen  
**damit** ich Originalbeleg und geparste Daten direkt vergleichen kann.

**Akzeptanzkriterien:**
- [ ] Ein Button/Tab "PDF anzeigen" erscheint nur, wenn `bon.paperless_doc_id` gesetzt ist
- [ ] Klick öffnet einen integrierten PDF-Viewer direkt in der Detailansicht (kein neues Tab)
- [ ] Die PDF wird via `GET /api/bons/[id]/pdf` on-demand von Paperless geholt und als Stream zurückgegeben
- [ ] Die PDF wird **nicht** lokal gespeichert — jeder Aufruf holt sie frisch
- [ ] Fehler (Paperless nicht erreichbar, Dokument nicht gefunden) werden als verständliche Fehlermeldung angezeigt
- [ ] Wenn kein `paperless_doc_id` vorhanden ist (z. B. manuell importierter eBon), wird der Button nicht angezeigt

### US-2: AVIS-PDF anzeigen
**Als** Nutzer in der Bon-Detailansicht eines Bons mit AVIS-Match  
**möchte ich** das originale AVIS-PDF inline sehen  
**damit** ich den Lieferschein direkt mit den geparsten Artikeln vergleichen kann.

**Akzeptanzkriterien:**
- [ ] Ein Button/Tab "AVIS anzeigen" erscheint nur, wenn `bon.has_avis === true` UND das AVIS-Dokument einen Paperless-Link hat
- [ ] Der Viewer zeigt das AVIS-PDF on-demand via `GET /api/avis/[importLogId]/pdf`
- [ ] Die PDF wird **nicht** lokal gespeichert
- [ ] **Schema-Ergänzung:** `import_log.paperless_doc_id INTEGER` wird bei `avis-sync` befüllt (Migration)
- [ ] Fehler werden als Fehlermeldung im Viewer angezeigt

### US-3: Viewer-Verhalten
**Als** Nutzer  
**möchte ich** den PDF-Viewer komfortabel bedienen können  
**damit** ich nicht zwischen mehreren Fenstern wechseln muss.

**Akzeptanzkriterien:**
- [ ] Der Viewer ist ein ausklappbarer Bereich unterhalb der Bon-Daten (kein Overlay/Modal)
- [ ] Beim zweiten Klick auf den Button wird der Viewer wieder eingeklappt (Toggle)
- [ ] Der Viewer zeigt eine Ladeindikation während der PDF geladen wird
- [ ] Auf kleinen Bildschirmen scrollt der Viewer vertikal

---

## Scope / Out of Scope

**In Scope:**
- Neue API-Route `GET /api/bons/[id]/pdf` — proxied Paperless-Download
- Neue API-Route `GET /api/avis/[importLogId]/pdf` — proxied Paperless-Download
- Migration: `import_log.paperless_doc_id` Spalte hinzufügen
- Update `avis-sync` Route, um `paperless_doc_id` beim Speichern zu befüllen
- Toggle-Bereich in `bon-detail.tsx` mit eingebettetem `<iframe>` oder `<embed>` für PDF

**Out of Scope:**
- PDF-Bearbeitung oder Annotation
- Herunterladen der PDF (Nutzer kann Paperless direkt aufrufen)
- PDF-Viewer für andere Dokument-Typen (Rechnungen etc.)
- Kontoauszug-PDF in der Bon-Ansicht (→ PROJ-29)

---

## Edge Cases

- `paperless_doc_id` vorhanden, aber Paperless-Server nicht erreichbar → Fehlermeldung im Viewer
- AVIS importiert ohne Paperless (manueller Upload) → `paperless_doc_id = null` → AVIS-Button nicht anzeigen
- Bon hat mehrere AVIS-Matches (verschiedene Lieferungen) → ersten `import_log` verwenden (der mit dem höchsten confidence-Score)
- Langsame Verbindung zu Paperless → Ladeindikator, kein Timeout-Crash

---

## API-Spezifikation

### GET /api/bons/[id]/pdf
- Liest `receipts.paperless_doc_id` aus DB
- Ruft `GET {PAPERLESS_URL}/api/documents/{paperless_doc_id}/download/` auf
- Gibt die PDF als Stream weiter (`Content-Type: application/pdf`)
- Gibt 404 zurück wenn `paperless_doc_id = null`
- Gibt 502 zurück wenn Paperless nicht erreichbar

### GET /api/avis/[importLogId]/pdf
- Liest `import_log.paperless_doc_id` aus DB
- Proxied analog zum eBon-Endpunkt
- Gibt 404 zurück wenn kein `paperless_doc_id`
