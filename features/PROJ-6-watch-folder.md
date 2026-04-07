# PROJ-6: Watch-Folder Auto-Import

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Parser-Logik wird wiederverwendet

## User Stories
- Als Nutzer möchte ich, dass neue PDFs in einem überwachten Ordner automatisch importiert werden, damit ich nicht manuell uploaden muss
- Als Nutzer möchte ich den Watch-Folder-Pfad konfigurieren können, damit ich einen für mich sinnvollen Ordner wählen kann
- Als Nutzer möchte ich sehen, wann zuletzt automatisch importiert wurde und wie viele Bons dabei gefunden wurden
- Als Nutzer möchte ich den Watch-Folder manuell triggern können ("Jetzt scannen"), damit ich nicht auf den nächsten automatischen Scan warten muss

## Acceptance Criteria
- [ ] Watch-Folder-Pfad ist konfigurierbar in der App (Einstellungsseite oder im Dashboard)
- [ ] Standard-Pfad: `data/ebons/` (relativ zum Projekt-Root)
- [ ] App scannt den Ordner beim Start und bei jeder Änderung (neue Datei hinzugefügt)
- [ ] Nur PDF-Dateien werden verarbeitet, andere Dateitypen werden ignoriert
- [ ] Bereits importierte PDFs werden nicht erneut importiert (Duplikat-Erkennung aus PROJ-1 greift)
- [ ] Bereits verarbeitete PDFs werden in Unterordner `data/ebons/imported/` verschoben
- [ ] Import-Log zeigt: Dateiname, Import-Status (Erfolg/Duplikat/Fehler), Timestamp
- [ ] "Jetzt scannen"-Button triggert manuellen Scan des Ordners
- [ ] Status-Anzeige: "Überwachung aktiv", "Letzter Scan: HH:MM", "X Bons heute importiert"

## Edge Cases
- Ordner existiert nicht → Fehlermeldung mit Hinweis, Ordner zu erstellen
- PDF ist während des Scans noch nicht vollständig geschrieben (laufender Download) → Retry nach 2 Sekunden, max 3 Versuche
- PDF ist kein REWE-Format → in `data/ebons/errors/` verschoben mit Fehlerprotokoll
- Sehr viele PDFs auf einmal (Batch-Import) → sequenziell verarbeitet, kein Timeout

## Technical Requirements
- Implementierung als Next.js API Route: `POST /api/watch/scan`
- Datei-Watching via `chokidar` (Node.js-Bibliothek)
- Watch-Folder-Pfad gespeichert in `data/config.json`
- Nur serverseitig (kein Browser-Zugriff auf Dateisystem)
- Log-Tabelle in SQLite: `import_log (id, filename, status, message, imported_at)`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
