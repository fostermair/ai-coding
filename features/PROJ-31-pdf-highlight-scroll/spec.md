# PROJ-31: PDF-Highlight & Auto-Scroll in Transaktionsansicht

## Status: In Progress
**Created:** 2026-05-24
**Last Updated:** 2026-05-24
**Feature Folder:** `features/PROJ-31-pdf-highlight-scroll/`

### Implementation Notes (v1 - MVP)

**MVP-Phase 1 (aktuell):** Click-to-Open Logik ohne Text-Layer-Highlight
- Separate `KontoauszugPdfViewer`-Komponente erstellt
- `highlightedTxId`-State in `TransactionList` hinzugefügt
- Transaktionszeilen sind jetzt klickbar (mit [paperless]-Check)
- Toggle-Logik implementiert: gleiche TX → schließen; andere TX gleiche Gruppe → Highlight verschieben; andere Periode → neue Gruppe öffnen
- Gruppen-FileText-Button öffnet PDF ohne Highlight (bestehend)
- Zur Zeit: iframe wird verwendet (same as PROJ-29)

**Future Enhancement:** React-PDF mit Text-Layer-Suche
- Ersetze iframe durch react-pdf `<Document>` + `<Page>` mit `renderTextLayer={true}`
- Implementiere Text-Suche nach jedem Text-Layer-Render (Datum DD.MM.YYYY + Betrag formatiert)
- Gelbes Overlay-div über Suchtreffern positionieren
- `scrollIntoView` zum Auto-Scroll nutzen
- Requires: `npm install react-pdf` (bereits done) + spezielle SSR-Konfiguration

## Dependencies
- PROJ-29 (Kontoauszug-PDF-Toggle) — stellt die PDF-Quelle pro Periode bereit
- PROJ-25 (Bon-Kontoauszug Abgleich) — stellt die Transaktionsdaten bereit

## User Stories

- Als Nutzer möchte ich auf eine Transaktion in der Transaktionsansicht klicken, damit der zugehörige Kontoauszug-PDF automatisch öffnet.
- Als Nutzer möchte ich, dass die angeklickte Transaktion im PDF gelb hervorgehoben wird, damit ich sie sofort visuell identifizieren kann.
- Als Nutzer möchte ich, dass die Ansicht automatisch zur hervorgehobenen Transaktion scrollt, damit ich nicht manuell suchen muss.
- Als Nutzer möchte ich zwischen verschiedenen Transaktionen derselben Periode wechseln können, wobei sich der Highlight entsprechend verschiebt.
- Als Nutzer möchte ich das PDF schließen können, um wieder die volle Transaktionsliste zu sehen.

## Acceptance Criteria

- [ ] Ein Klick auf eine Transaktionszeile öffnet das PDF des zugehörigen Kontoauszugs (nur wenn `kontoauszug_datei` mit `[paperless]` beginnt)
- [ ] Die angeklickte Transaktion wird im PDF durch ein gelbes Highlight markiert (Datum + Betrag als Suchschlüssel im Text-Layer)
- [ ] Die Ansicht scrollt automatisch und smooth zur markierten Zeile im PDF
- [ ] Ein zweiter Klick auf dieselbe Transaktion schließt das PDF wieder (Toggle)
- [ ] Klick auf eine andere Transaktion derselben Periode: PDF bleibt offen, Highlight wechselt zur neuen Transaktion
- [ ] Klick auf eine Transaktion einer anderen Periode: vorheriges PDF schließt, neues PDF öffnet mit Highlight
- [ ] Transaktionen ohne Paperless-PDF (`kontoauszug_datei` ist null oder hat kein `[paperless]`-Prefix) sind nicht klickbar bzw. zeigen keinen PDF-Toggle
- [ ] Der bestehende PDF-Toggle-Button pro Gruppe (FileText-Icon) bleibt erhalten und öffnet das PDF ohne Highlight
- [ ] Kein Highlight bleibt sichtbar wenn das PDF über den Gruppen-Toggle (ohne Transaktions-Klick) geöffnet wird

## Edge Cases

- **Transaktion nicht im PDF gefunden:** Text-Suche findet keine Übereinstimmung (z.B. ungewöhnliche Datumsformatierung im PDF) → PDF öffnet sich, aber ohne Highlight; kein Fehler für den User
- **Mehrere Treffer für dasselbe Datum+Betrag:** Es existieren zwei Transaktionen mit gleichem Betrag am gleichen Tag → erster Treffer wird hervorgehoben (akzeptiertes Verhalten in v1)
- **PDF lädt langsam:** Highlight wird erst nach Fertigstellung des Text-Layer-Scans gesetzt; Ladeindikator bleibt bis dahin sichtbar
- **Großes PDF (viele Seiten):** Lazy Rendering — nur sichtbare Seiten werden gerendert; Suche läuft seitenweise bis Treffer gefunden
- **PDF ohne Text-Layer (gescannt):** Kein Text-Layer verfügbar → PDF öffnet sich ohne Highlight, keine Fehlermeldung
- **Accordion-Gruppe wird zugeklappt:** PDF schließt sich (bestehende Logik aus PROJ-29 bleibt erhalten)

## Technical Requirements

- Ersatz des `<iframe>` im Kontoauszug-PDF-Viewer durch `react-pdf` (PDF.js-Wrapper) für Text-Layer-Zugriff
- Suchstrategie: `buchungsdatum` als `DD.MM.YYYY` + `betrag_cents` als formatierter Betrag (z.B. `-25,50`)
- Highlight-Overlay: CSS-positioned gelbes `div` über dem Text-Layer-Element
- Scroll: `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` nach erstem Render mit Treffer
- Keine DB-Migration nötig — alle benötigten Felder (`buchungsdatum`, `betrag_cents`) sind bereits in der `Transaction`-Interface vorhanden

---
<!-- This file covers WHAT the feature does.
     Subsequent phases add their own files to this folder:
     - context-map.md  ← /architecture (tech design + file map)
     - qa-results.md   ← /qa (test results)
     - deployment.md   ← /deploy (production info)
-->
