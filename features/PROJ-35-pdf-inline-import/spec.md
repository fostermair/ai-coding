# PROJ-35: PDF-Inline-Ansicht in Import-History-Tabs

## Status: Deployed

---

## Summary

In allen Import-History-Tabs (eBons, AVIS, Bestellungen, Kontoauszüge) soll jede Zeile anklickbar sein. Ein Klick klappt direkt unterhalb der Zeile ein PDF-Viewer-Panel auf, das das zugehörige Dokument inline anzeigt — ohne Seitenwechsel. PDFs aus lokalem Dateisystem (`pdf_path`) und aus Paperless-ngx (`paperless_doc_id`) werden beide unterstützt.

---

## Dependencies

- Requires PROJ-34 (Import-Ansicht mit Reitern) — History-Tabellen müssen existieren
- Requires PROJ-32 (Bestellung Import) — `pdf_path` in `import_log` für Bestellungen

---

## User Stories

### US-1: Klick auf Import-Zeile öffnet PDF

Als Nutzer möchte ich in jedem Import-History-Tab auf eine Zeile klicken und darunter das zugehörige PDF inline sehen, ohne die Seite zu verlassen.

**Akzeptanzkriterien:**
- AC-1.1: Jede Zeile in allen 4 History-Tabellen (eBons, AVIS, Bestellungen, Kontoauszüge) ist anklickbar (Cursor pointer, visuelles Hover-Feedback)
- AC-1.2: Klick auf eine Zeile klappt ein PDF-Viewer-Panel direkt unterhalb der Zeile auf (kein Modal, kein Seitenwechsel)
- AC-1.3: Klick auf die gleiche Zeile nochmal klappt das Panel wieder zu (Toggle-Verhalten)
- AC-1.4: Gleichzeitig kann nur ein Panel offen sein — Klick auf eine andere Zeile schließt die vorherige automatisch

### US-2: PDF-Quellen unterstützen

Als Nutzer möchte ich PDFs sehen — egal ob lokal gespeichert oder aus Paperless-ngx.

**Akzeptanzkriterien:**
- AC-2.1: Lokale PDFs (`pdf_path` in `import_log` vorhanden): PDF wird über einen lokalen Datei-Serving-Endpoint geladen
- AC-2.2: Paperless-PDFs (`paperless_doc_id` in `import_log` vorhanden): PDF wird über Paperless-API (`/api/paperless/document/{id}/pdf` oder analog) geladen
- AC-2.3: Wenn kein PDF verfügbar (kein `pdf_path` UND kein `paperless_doc_id`): Inline-Bereich zeigt Hinweistext „Kein PDF verfügbar" statt Viewer
- AC-2.4: Priorität bei beiden vorhanden: lokaler `pdf_path` hat Vorrang vor `paperless_doc_id`

### US-3: Kontoauszüge inline anzeigen

Als Nutzer möchte ich auch Kontoauszugs-PDFs inline sehen können.

**Akzeptanzkriterien:**
- AC-3.1: Kontoauszugs-Einträge (aus `bank_statement_log`) unterstützen die gleiche Inline-PDF-Anzeige
- AC-3.2: PDF-Quelle analog zu anderen Tabs — via `paperless_doc_id` oder gespeichertem Pfad

### US-4: Viewer-Darstellung

Als Nutzer möchte ich das PDF komfortabel lesen können.

**Akzeptanzkriterien:**
- AC-4.1: PDF-Viewer ist ein `<iframe>` mit fester Mindesthöhe (600px) und voller Tabellenbreite
- AC-4.2: Viewer ist scrollbar bei langen Dokumenten
- AC-4.3: Loading-Indikator während das PDF lädt
- AC-4.4: Fehlerfall (PDF nicht ladbar / Paperless nicht erreichbar): Fehlermeldung im Inline-Bereich statt leerem iframe

---

## Edge Cases

- **Kein PDF vorhanden:** Zeile bleibt anklickbar, Panel zeigt Hinweistext „Kein PDF verfügbar"
- **Paperless nicht erreichbar:** Panel zeigt Fehlermeldung „PDF konnte nicht geladen werden"
- **Sehr großes PDF:** iframe hat feste Höhe (600px), ist intern scrollbar
- **Schnelles Klicken zwischen Zeilen:** immer nur ein Panel offen, vorheriges schließt sofort
- **Kontoauszüge ohne paperless_doc_id:** Hinweistext, kein Absturz

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-05-27 | Deployed | Implemented: new `/api/import/pdf` endpoint + row-click expansion in `import-history-table.tsx` |
| 2026-05-27 | Planned | Spec created |
