# PROJ-18: Paperless-ngx eBon Import

**Status:** Approved  
**Created:** 2026-05-17  
**Priority:** P1  

## Feature Summary

Nutzer können REWE eBons automatisch aus einer lokalen paperless-ngx-Instanz über die REST-API abrufen und in die Datenbank importieren. Der Sync wird manuell per Button ausgelöst und springt bereits importierte Bons automatisch über.

## Problem Statement

Aktuell müssen Nutzer eBon-PDFs von Hand exportieren und in die App hochladen. Wer paperless-ngx nutzt (eine lokale Dokumentenverwaltung), muss die Bons doppelt speichern — einmal in paperless, einmal in eBon-App. Die Integration würde Workflow vereinfachen.

## Goals

1. **Automatische Deduplizierung:** Bereits importierte Bons werden nicht erneut eingefügt
2. **Einfache Konfiguration:** Nutzer stellt Zugansdaten einmalig in `.env.local` ein, keine UI-Konfiguration erforderlich
3. **Transparenz:** Nutzer sieht Sync-Ergebnis (neu, Duplikate, Fehler) in der UI
4. **Robustheit:** API-Fehler führen nicht zum Programmabsturz, sondern zu verständlichen Fehlermeldungen

## User Stories

### US1: Einmalige Konfiguration
**Als** Nutzer  
**Möchte ich** die paperless-Verbindung in `.env.local` einmalig einrichten  
**Um** nicht jedes Mal Zugangsdaten eingeben zu müssen  

**Akzeptanzkriterien:**
- App liest `PAPERLESS_URL`, `PAPERLESS_TOKEN`, `PAPERLESS_CORRESPONDENT_ID`, `PAPERLESS_DOCUMENT_TYPE_ID` aus der Umgebung
- Falls Variablen fehlen, wird ein Konfigurationshinweis angezeigt (Sync-Button deaktiviert)

### US2: Manuelle Sync-Auslösung
**Als** Nutzer  
**Möchte ich** mit einem Button in der UI einen Sync mit paperless-ngx starten  
**Um** neue eBons auf Abruf zu importieren  

**Akzeptanzkriterien:**
- Ein prominenter „Sync aus paperless"-Button befindet sich in der UI (z.B. neben dem Datei-Upload)
- Nutzer sieht während des Syncs einen Ladeindikator
- Nach erfolgreicher Ausführung zeigt sich eine Zusammenfassung: „X eBons importiert, Y Duplikate übersprungen, Z Fehler"

### US3: Automatische Duplikatsprüfung
**Als** Nutzer  
**Möchte ich** keine Duplikate entstehen, auch wenn ich mehrmals syncen  
**Um** saubere Daten zu behalten  

**Akzeptanzkriterien:**
- Der Sync nutzt die bestehende Duplikatprüfung (`receipt_nr + market_nr + receipt_date`)
- Duplikate werden stillschweigend übersprungen, nicht als Fehler markiert

### US4: Fehlertoleranz
**Als** Nutzer  
**Möchte ich** aussagekräftige Fehlermeldungen sehen, wenn etwas schief geht  
**Um** Probleme schnell zu beheben  

**Akzeptanzkriterien:**
- Ist paperless-API nicht erreichbar, zeigt sich: „paperless-ngx nicht erreichbar. Prüfe URL und Netzwerk."
- Invalid-Token-Fehler (401): „Auth-Token ungültig. Prüfe PAPERLESS_TOKEN in .env.local"
- Ein PDF lässt sich nicht parsen: wird übersprungen, zählt als Fehler, Sync läuft weiter

## Acceptance Criteria

1. ✅ App liest `PAPERLESS_URL`, `PAPERLESS_TOKEN`, `PAPERLESS_CORRESPONDENT_ID`, `PAPERLESS_DOCUMENT_TYPE_ID` aus `.env` (mit Fallback auf undefined)
2. ✅ Neuer Endpunkt `POST /api/paperless/sync` existiert
3. ✅ Endpunkt quert paperless-ngx-API mit Filterung nach Korrespondent + Dokumenttyp
4. ✅ Jedes Dokument wird als PDF heruntergeladen (mit korrektem Token-Auth)
5. ✅ Heruntergeladenes PDF wird durch `parseReweEbon()` geparst
6. ✅ Import nutzt bestehende Duplikatprüfung — Duplikate werden übersprungen
7. ✅ Endpunkt gibt JSON zurück: `{ imported: number, duplicates: number, errors: number, details: Array<{...}> }`
8. ✅ Sync-Button in der UI triggert Endpunkt, zeigt Ladeindikator, zeigt Ergebnis
9. ✅ Sind Env-Variablen unvollständig, ist Button deaktiviert mit Hinweis
10. ✅ API-Fehler werden abgefangen, nutzerfreundliche Fehlermeldung angezeigt (kein Crash)
11. ✅ Alle Sync-Vorgänge (erfolgreich, Fehler) werden in `import_log` protokolliert mit `filename = "[paperless] Dokumenttitel"`

## Edge Cases

| Szenario | Verhalten |
|----------|-----------|
| paperless liefert 0 Dokumente | „Keine neuen eBons gefunden" anzeigen |
| 1 von 5 PDFs schlägt beim Download fehl | 4 importiert, 1 als Fehler protokolliert, Sync läuft weiter |
| PDF ist nicht gültig (Parser-Fehler) | Fehler protokolliert, als Fehler gezählt, nächstes Doc verarbeitet |
| paperless-Token ungültig (401) | Deutliche Auth-Fehlermeldung |
| paperless-URL nicht erreichbar (502/503) | „API nicht verfügbar" Meldung, Sync abbricht |
| Netzwerk-Timeout | Timeout-Fehlermeldung mit Hinweis zum Wiederholen |
| Duplikat wird neu abgerufen (bereits importiert) | Still übersprungen, nicht als Fehler gezählt |
| Alle Operationen erfolgreich | „Alles erledigt: X neu, Y Duplikate übersprungen" |

## Technical Notes

- **paperless-ngx API:**
  - `GET {URL}/api/documents/?correspondent__id=X&document_type__id=Y&page_size=100` — Dokumente auflisten
  - `GET {URL}/api/documents/{id}/download/` — PDF als Binary
  - Auth Header: `Authorization: Token {PAPERLESS_TOKEN}`
  - Paginierung: `next` Feld in Antwort

- **Duplikat-Logik:** Nutzt bestehenden Query aus `src/app/api/import/route.ts` (Zeile ~103)

- **Logging:** Bestehende `logImport(filename, status, message)` Funktion wird wiederverwendet

- **DB-Transaction:** Wie bei manuellem Import werden alle Inserts in einer Transaction verarbeitet

## Dependencies

**Requires:** PROJ-1 (eBon Import & Parser)
- Nutzt: `parseReweEbon(text: string): ParsedReceipt`
- Nutzt: `logImport(filename: string, status: string, message: string): void`
- Nutzt: bestehende Duplikat-Prüfung via `receipt_nr + market_nr + receipt_date`

**No conflicts with:** PROJ-2–17

## Out of Scope

- Automatischer Sync beim App-Start
- Löschen von Dokumenten in paperless
- Syncing von mehreren paperless-Instanzen
- Import von Dokumenten mit anderen Korrespondenten/Typen
- OCR für gescannte Bons (paperless hat das bereits)

## Success Metrics

- [ ] Sync-Endpunkt antwortet korrekt mit Zusammenfassung
- [ ] 5+ neue eBons werden importiert und in der Produktliste sichtbar
- [ ] Duplikate werden übersprungen (kein 2. Import)
- [ ] Fehler werden abgefangen ohne App-Crash
- [ ] Nutzer kann Sync aus der UI triggern und sieht Ergebnis
- [ ] Env-Variablen fehlen → Button ist deaktiviert mit Hinweis
