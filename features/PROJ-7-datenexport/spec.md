# PROJ-7: Datenexport (Excel & CSV)

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Daten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Alias-Namen im Export verwenden

## User Stories
- Als Nutzer möchte ich alle Bons als CSV exportieren können, damit ich die Daten in anderen Tools weiterverarbeiten kann
- Als Nutzer möchte ich alle Bons als Excel-Datei (.xlsx) exportieren können, mit mehreren Tabellenblättern für übersichtliche Auswertungen
- Als Nutzer möchte ich den Export auf einen Zeitraum einschränken können, damit ich z.B. nur Daten eines Monats exportiere
- Als Nutzer möchte ich wählen können, ob Produktnamen als Rohname oder Alias exportiert werden

## Acceptance Criteria

### CSV-Export
- [ ] Export-Button auf Bon-Übersichtsseite und Statistik-Dashboard
- [ ] CSV enthält Spalten: Datum, Uhrzeit, Markt, Bon-Nr., Produktname (Alias oder Rohname), Menge, Einzelpreis, Gesamtpreis, MwSt-Code, Rabatt, Rabattbetrag
- [ ] Eine Zeile pro Produktposition (nicht pro Bon)
- [ ] Encoding: UTF-8 mit BOM (für Excel-Kompatibilität)
- [ ] Dezimaltrennzeichen: Komma (deutsche Lokalisation)
- [ ] Dateiname: `ebon-export-YYYY-MM-DD.csv`

### Excel-Export (.xlsx)
- [ ] Excel-Datei enthält 3 Tabellenblätter:
  1. **Alle Positionen** – gleicher Inhalt wie CSV, zeilenweise alle Produkte
  2. **Bon-Übersicht** – eine Zeile pro Bon mit Datum, Markt, Summe, Anzahl Artikel
  3. **Top-Produkte** – Top-20 häufigste Produkte mit Gesamtausgaben und Kaufhäufigkeit
- [ ] Spaltenbreiten automatisch angepasst
- [ ] Header-Zeile fett formatiert
- [ ] Dateiname: `ebon-export-YYYY-MM-DD.xlsx`

### Filter
- [ ] Zeitraum-Filter: Von-Bis Datum (optional, Standard = alle Daten)
- [ ] Produktnamen: Alias bevorzugt (Rohname als Fallback wenn kein Alias)

## Edge Cases
- Keine Daten vorhanden → leere Datei mit Header-Zeile, Hinweis im UI
- Produktname enthält Komma (CSV) → korrekt in Anführungszeichen eingeschlossen
- Sehr große Datenmenge (1000+ Positionen) → Export läuft durch, kein Timeout (max 30s)
- Excel: Zahl-Felder als Zahlenformat gespeichert (nicht als Text), damit Excel rechnen kann

## Technical Requirements
- API: `GET /api/export/csv?from=YYYY-MM-DD&to=YYYY-MM-DD`
- API: `GET /api/export/xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Excel-Library: `exceljs` (weit verbreitet, gut dokumentiert)
- CSV: native Node.js String-Generierung (keine externe Library nötig)
- Download wird direkt als Datei-Response geliefert (Content-Disposition: attachment)
