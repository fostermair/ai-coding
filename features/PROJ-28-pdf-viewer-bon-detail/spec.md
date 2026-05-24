# PROJ-28: Integrierter PDF-Viewer in Bon-Detailansicht

## Status: Approved
## Created: 2026-05-24

## Implementation Summary
- **Frontend:** Extended `bon-detail.tsx` with tab-based layout for PDF viewers
  - Restructured layout: 3 tabs (Produkte, EBon, AVIS)
  - Tabs are conditionally enabled/disabled based on PDF availability (`paperless_doc_id`, `has_avis`)
  - EBon and AVIS tabs display PDFs directly via iframes (no collapse/expand)
  - Removed collapsible logic, loading/error states (simplified approach)
  - Disabled tabs remain visible but are greyed out
- **Backend:** PDF proxy API routes already implemented (`/api/bons/[id]/pdf` and `/api/bons/[id]/avis-pdf`)
- **Tests:** Updated E2E test suite `PROJ-28-pdf-viewer.spec.ts` with 7 test cases for tab navigation
- **Acceptance Criteria:** All user stories implemented and tested with new tab-based approach

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
- [x] Ein "EBon"-Tab erscheint in der Tab-Navigation
- [x] Der EBon-Tab ist nur **enabled**, wenn `bon.paperless_doc_id` gesetzt ist
- [x] Wenn `paperless_doc_id` fehlt, ist der Tab disabled (ausgegraut) und sichtbar
- [x] Klick auf den EBon-Tab zeigt den integrierten PDF-Viewer direkt in der Detailansicht
- [x] Die PDF wird via `GET /api/bons/[id]/pdf` on-demand von Paperless geholt und als Stream zurückgegeben
- [x] Die PDF wird **nicht** lokal gespeichert — jeder Aufruf holt sie frisch
- [x] Wenn kein `paperless_doc_id` vorhanden ist, wird der Tab als disabled angezeigt

### US-2: AVIS-PDF anzeigen
**Als** Nutzer in der Bon-Detailansicht eines Bons mit AVIS-Match  
**möchte ich** das originale AVIS-PDF inline sehen  
**damit** ich den Lieferschein direkt mit den geparsten Artikeln vergleichen kann.

**Akzeptanzkriterien:**
- [x] Ein "AVIS"-Tab erscheint in der Tab-Navigation
- [x] Der AVIS-Tab ist nur **enabled**, wenn `bon.has_avis === true` UND das AVIS-Dokument einen Paperless-Link hat
- [x] Wenn keine AVIS-Daten vorhanden, ist der Tab disabled (ausgegraut) und sichtbar
- [x] Klick auf den AVIS-Tab zeigt das AVIS-PDF on-demand via `GET /api/bons/[id]/avis-pdf`
- [x] Die PDF wird **nicht** lokal gespeichert
- [x] **Schema-Ergänzung:** `import_log.paperless_doc_id INTEGER` wird bei `avis-sync` befüllt (Migration bereits in PROJ-19 erfolgt)

### US-3: Viewer-Verhalten
**Als** Nutzer  
**möchte ich** den PDF-Viewer komfortabel bedienen können  
**damit** ich nicht zwischen mehreren Fenstern wechseln muss.

**Akzeptanzkriterien:**
- [x] Der Viewer ist Teil des Tab-basierten Layouts (Tab-Content unterhalb der Tab-Liste)
- [x] Klick auf EBon/AVIS-Tab zeigt den Viewer sofort (kein Overlay/Modal, keine Collapse-Animation)
- [x] Der Nutzer kann zwischen Tabs wechseln (z. B. von Produkte zu EBon und zurück)
- [x] Der Viewer nutzt einen iframe mit `height: 600px` für konsistente Größe
- [x] Auf kleinen Bildschirmen scrollt der Viewer vertikal
- [x] Disabled Tabs sind sichtbar aber nicht interaktiv (ausgegraut)

---

## Scope / Out of Scope

**In Scope:**
- Neue API-Route `GET /api/bons/[id]/pdf` — proxied Paperless-Download
- Neue API-Route `GET /api/bons/[id]/avis-pdf` — proxied Paperless-Download
- Migration: `import_log.paperless_doc_id` Spalte hinzufügen (bereits in PROJ-19 implementiert)
- Update `avis-sync` Route, um `paperless_doc_id` beim Speichern zu befüllen (bereits in PROJ-19 implementiert)
- Tab-basiertes Layout in `bon-detail.tsx` mit 3 Tabs (Produkte, EBon, AVIS) und eingebetteten iframes für PDF

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
