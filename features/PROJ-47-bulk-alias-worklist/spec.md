# PROJ-47: Bulk-Alias-Pflege-Worklist

**Status:** Planned
**Created:** 2026-05-29
**Last Updated:** 2026-05-29
**Priority:** P1 (Sprint 1 — Daten-Qualitäts-Fundament)
**Feature Folder:** `features/PROJ-47-bulk-alias-worklist/`

## Feature Summary

Eigene Sicht "Ungemappte Artikel" in `/produkte`: Liste aller `raw_name` ohne Alias, sortiert nach Häufigkeit, mit inline-Vorschlag aus PROJ-46 und einer Bulk-Aktion "Alle Vorschläge mit Konfidenz ≥ N % übernehmen". Macht Alias-Pflege zu einer 5-Minuten-Aufgabe.

## Problem Statement

Selbst mit Vorschlägen (PROJ-46) bleibt die Pflege mühsam, solange Nutzer keinen Überblick über offene Lücken hat und jeden Eintrag einzeln im Import-Dialog bestätigen muss. Eine zentrale Worklist mit Bulk-Aktion löst das.

## Goals

1. **Sichtbare Backlog-Liste** aller ungemappten `raw_name`s an einem Ort.
2. **Priorisierung nach Häufigkeit** — wichtigste Lücken zuerst.
3. **Inline-Vorschlag** aus PROJ-46 ohne Re-Berechnung pro Klick.
4. **Bulk-Übernahme** mit Konfidenz-Schwellwert in einer Transaktion.
5. **Wiederverwendung** der Spaltenfilter aus PROJ-15.

## User Stories

### US1: Liste aller ungemappten Artikel
**Als** Nutzer
**möchte ich** eine Liste aller noch nicht aliasierten `raw_name`s sehen, sortiert nach Häufigkeit,
**damit** ich die wichtigsten Lücken zuerst schließen kann.

**Akzeptanzkriterien:**
- Neue Sicht in `/produkte` als Tab oder Section: "Ungemappte Artikel".
- Tabelle mit Spalten: `raw_name | Anzahl Vorkommen | letzter Bon (Datum) | Vorschlag | Konfidenz | Eingabefeld | Aktion`.
- Default-Sortierung nach `Anzahl Vorkommen` DESC.
- Spaltensortierung und -filterung gemäß PROJ-15.

### US2: Inline-Übernahme
**Als** Nutzer
**möchte ich** pro Zeile den Vorschlag inline mit einem Klick übernehmen,
**damit** Alias-Pflege schnell geht.

**Akzeptanzkriterien:**
- Button "Übernehmen" pro Zeile speichert den Vorschlag als Alias (`source='suggested'`).
- Übernommene Zeile verschwindet aus der Liste.
- Eingabefeld erlaubt abweichenden Alias (`source='manual'`).
- Klick auf "Überspringen" markiert die Zeile sitzungsweit als ignoriert (kein Persist nötig in Sprint 1).

### US3: Bulk-Aktion mit Konfidenz-Schwellwert
**Als** Nutzer
**möchte ich** "Alle Vorschläge mit Konfidenz ≥ N % übernehmen" als Bulk-Aktion,
**damit** ich nicht jede Zeile einzeln klicken muss.

**Akzeptanzkriterien:**
- Schwellwert-Slider mit Default 90 %.
- Vorschau-Text "X Aliase werden gesetzt".
- Confirmation-Dialog vor Ausführung.
- Bulk-Save läuft in einer DB-Transaktion; bei Fehler Rollback und klare Fehlermeldung.
- Bei 0 Kandidaten ist der Button disabled.

### US4: Empty State
**Als** Nutzer
**möchte ich** klar erkennen, wenn alle Artikel aliasiert sind,
**damit** ich weiß, dass keine Arbeit offen ist.

**Akzeptanzkriterien:**
- Leere Liste → Empty-State-Meldung "Alle Artikel sind aliasiert ✓".

## Acceptance Criteria (zusammengefasst)

1. Neue Sicht in `/produkte` zeigt alle `raw_name` ohne Eintrag in `product_aliases`.
2. Pro Zeile: Häufigkeit, letztes Bon-Datum, Vorschlag (PROJ-46) inkl. Konfidenz, Inline-Eingabefeld, Aktion.
3. Default-Sortierung nach Häufigkeit DESC; PROJ-15-konforme Sortier-/Filterspalten.
4. Inline-Übernahme entfernt die Zeile sofort aus der Liste und speichert als `source='suggested'` bzw. `source='manual'`.
5. Bulk-Aktion mit Slider, Preview, Confirmation, DB-Transaktion.
6. Empty-State-Meldung bei leerer Liste.
7. API-Endpoint `GET /api/aliases/unmapped` liefert ungemappte `raw_name`s mit Vorkommen, letztem Datum und Vorschlag.
8. API-Endpoint `POST /api/aliases/bulk` akzeptiert eine Liste `{ raw_name, alias, source }[]` und speichert atomar.

## Edge Cases

| Szenario | Verhalten |
|---|---|
| Nutzer setzt manuell einen Alias, der gleichzeitig Vorschlag anderer Zeilen ist | Andere Zeilen aktualisieren ihren Vorschlag **nicht** automatisch; erst beim nächsten Laden |
| Sehr lange Liste (>500 Zeilen) | Pagination oder virtuelles Scrollen (finale Entscheidung in `/architecture`) |
| Bulk-Aktion auf 0 Kandidaten | Button disabled |
| Parallel laufender Import schiebt neue Zeilen rein | Liste lädt beim Tab-Wechsel neu; kein Live-Refresh erforderlich |
| Bulk-Save schlägt mid-transaction fehl | Rollback, Fehlermeldung, Liste unverändert |
| Nutzer übersprungene Zeile soll später wieder erscheinen | "Übersprungen"-Status nur session-lokal; nach Reload wieder sichtbar |

## Technical Notes

- Vorschläge können beim Laden der Liste serverseitig vorab berechnet werden (PROJ-46-Wrapper auf alle ungemappten `raw_name`s).
- Cache: einmalige Abfrage der existierenden Aliase pro Request.
- Bulk-Endpoint sollte idempotent sein (`INSERT OR IGNORE` bzw. `INSERT … ON CONFLICT(raw_name) DO NOTHING`).
- UI kann eine bestehende Tabellenkomponente aus `/produkte` wiederverwenden.

## Dependencies

**Requires:** PROJ-46 (Vorschlags-Engine), PROJ-3 (Alias-System).
**Optional Reuse:** PROJ-15 (Spaltenfilter).

## Out of Scope

- Bulk-Kategorie-Zuweisung — geht über PROJ-45-Regelwerk.
- Periodische Erinnerungen / Notifications für ungemappte Artikel.
- Persistente "Skip"-Liste (übersprungene Einträge erscheinen nach Reload wieder).
- Multi-User-Konflikte (App ist single-user laut PRD).

## Success Metrics

- [ ] Nutzer kann eine typische Anzahl ungemappter Artikel (50–100) in < 5 Minuten durcharbeiten.
- [ ] Bulk-Aktion mit 90 %-Schwellwert übernimmt im Schnitt ≥ 60 % der Vorschläge fehlerfrei.
- [ ] Anzahl ungemappter Artikel sinkt nach erstem Durchlauf der Worklist um mind. 70 %.
