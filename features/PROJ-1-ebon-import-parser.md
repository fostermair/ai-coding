# PROJ-1: eBon Import & Parser

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
