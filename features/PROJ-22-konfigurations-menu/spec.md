# PROJ-22: Konfigurations-Menü (AVIS-DB & Alias löschen)

**Status:** Approved  
**Created:** 2026-05-20  
**Dependencies:** None (standalone feature)

---

## Problem Statement

Benutzer benötigen eine Möglichkeit, ihre Datenbank zu bereinigen:
- Die gesamte AVIS-Datenbank löschen (alle AVIS-Importe, Matches, Aliases)
- Alle Produktalias löschen (aber Daten in eBons beibehalten)

Aktuell gibt es keine UI dafür — nur manuelle Datenbank-Manipulation möglich.

---

## User Stories

### US-1: AVIS-Datenbank löschen
**Als Benutzer** möchte ich die gesamte AVIS-Datenbank löschen können, damit ich einen Neustart mit frischen AVIS-Daten machen kann.

### US-2: Alle Alias löschen
**Als Benutzer** möchte ich alle Produktalias auf einmal löschen können, damit ich alle Artikel auf ihre ursprünglichen Rohnames zurücksetze.

### US-3: Konfigurations-Menü öffnen
**Als Benutzer** möchte ich ein Konfigurations-Menü in der App öffnen können, damit ich die Verwaltungsoptionen finde.

---

## Acceptance Criteria

### AC-1: Konfigurations-Menü erreichbar
- [ ] Es gibt einen Button/Link "Einstellungen" oder "Konfiguration" irgendwo in der Hauptnavigation oder in einem Dropdown-Menü
- [ ] Klick öffnet einen Dialog/Seite mit administrativen Funktionen
- [ ] Das Menü ist deutlich vom Benutzer trennbar (z. B. über ein Zahnrad-Icon oder "Admin")

### AC-2: AVIS-Datenbank löschen
- [ ] Der Dialog zeigt einen "AVIS-Datenbank löschen" Button
- [ ] Klick auf den Button öffnet eine Bestätigungsdialog mit Warnung:
  - "Dies löscht ALLE AVIS-Importe, Matches und automatisch gesetzten Alias."
  - "Eben diese Aktion kann nicht rückgängig gemacht werden."
- [ ] Bestätigungsbutton ("Ja, löschen") löscht folgende Daten:
  - Alle Einträge aus `import_log` mit Filename wie `[AVIS]%`
  - Alle Einträge aus `avis_matches` (die zu gelöschten Import-Logs gehören)
  - Alle Alias-Einträge, die durch AVIS auto_set gesetzt wurden (mit Status `auto_set` in avis_matches)
  - **NICHT:** eBon-Daten (receipts, receipt_items, discounts)
  - **NICHT:** manuell gesetzte Alias (mit match_source = 'avis_document' oder 'global_database')

### AC-3: Alle Alias löschen
- [ ] Der Dialog zeigt einen "Alle Alias löschen" Button
- [ ] Klick auf den Button öffnet eine Bestätigungsdialog mit Warnung:
  - "Dies setzt alle Produktalias zurück auf die ursprünglichen Rohnames."
  - "Eben diese Aktion kann nicht rückgängig gemacht werden."
- [ ] Bestätigungsbutton ("Ja, löschen") löscht:
  - Alle Einträge aus `product_aliases`
  - **NICHT:** AVIS-Daten, eBon-Daten, oder andere Tabellen

### AC-4: Erfolgsmeldung
- [ ] Nach erfolgreichem Löschen zeigt die App eine Erfolgsmeldung:
  - Bei AVIS-Löschung: "AVIS-Datenbank gelöscht. X Imports entfernt."
  - Bei Alias-Löschung: "Alle Alias gelöscht. Y Einträge zurückgesetzt."
- [ ] Die Erfolgsmeldung verschwindet nach 3-5 Sekunden oder beim Schließen des Dialogs
- [ ] Die UI aktualisiert sich nicht automatisch (User kann manuell refreshen, wenn nötig)

### AC-5: Error Handling
- [ ] Falls das Löschen fehlschlägt, zeigt die App eine Fehlermeldung:
  - "Fehler beim Löschen der AVIS-Datenbank aufgetreten"
  - "Fehler beim Löschen der Alias aufgetreten"
- [ ] Der Dialog bleibt offen, damit der User die Aktion wiederholen kann

### AC-6: Bestätigung erforderlich
- [ ] Kein Löschen ohne explizite Bestätigung durch den User
- [ ] Bestätigungsdialog verwendet deutliche Warnung (rot/gefährlich aussehend)
- [ ] Abbrechen-Button schließt den Dialog ohne Löschen

---

## Edge Cases

- **Leere Datenbank:** Falls keine AVIS oder Alias vorhanden sind, zeigt die App:
  - "Keine AVIS-Daten zum Löschen vorhanden"
  - "Keine Alias zum Löschen vorhanden"
- **Während Löschen öffnet User neue Tab:** Löschen sollte nicht abgebrochen werden (Backend-Lock nicht nötig, da SQLite single-write)
- **Gleichzeitiges Löschen von AVIS und Alias:** User kann beide Optionen nacheinander wählen — kein Problem
- **User löscht Alias, dann versucht AVIS-Löschung:** Falls ein AVIS-Match auf einen gelöschten Alias verweist, sollte das Löschen der AVIS-DB trotzdem funktionieren

---

## Success Metrics

- ✅ User kann AVIS-Datenbank mit 2 Klicks löschen (Button + Bestätigung)
- ✅ User kann alle Alias mit 2 Klicks löschen (Button + Bestätigung)
- ✅ Keine unbeabsichtigten Löschungen durch versehentliche Klicks
- ✅ Erfolgsmeldung bestätigt, was gelöscht wurde

---

## Implementation Notes

### UI-Struktur
- Settings-Button mit Zahnrad-Icon in der **rechten** Navigation (neben dem Logo auf der rechten Seite der Nav)
- Öffnet einen Modal Dialog mit Admin-Funktionen
- Dialog bleibt offen, damit User mehrere Aktionen nacheinander durchführen kann

### Künftige Admin-Funktionen (Out of Scope für PROJ-22, aber geplant)
Diese Feature-Struktur ist als Basis für weitere Admin-Funktionen gedacht:
- **Datenbank-Backup:** SQLite-DB als .db-Datei herunterladen
- **Statistik-Reset:** Alle Statistik-Caches leeren (monatliche Trends, Inflation-Daten)
- **Produktlisten-Reset:** Alle Produkte auf Standard-Kategorisierung zurücksetzen
- **Import-Logs anzeigen:** Übersicht aller bisherigen Importe (eBon, AVIS, Paperless)

*Diese werden als separate PROJ-X Features definiert, verwenden aber dasselbe ConfigDialog.*

---

## Database Schema Changes

Keine neuen Tabellen oder Spalten erforderlich. Löscht nur aus bestehenden Tabellen.

---

## API Endpoints (Planned)

| Method | Route | Beschreibung |
|--------|-------|-------------|
| DELETE | `/api/avis/db` | Löscht AVIS-Datenbank |
| DELETE | `/api/produkte/aliases` | Löscht alle Alias |

---

## Related Features

- [[PROJ-3-produktdatenbank-alias|PROJ-3]]: Produktdatenbank & Alias-Verwaltung
- [[PROJ-19-avis-alias-import|PROJ-19]]: AVIS-Import & automatische Alias-Zuweisung
