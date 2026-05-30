# PROJ-44: Personal Inflations-Index

## Status: Approved
**Created:** 2026-05-30
**Last Updated:** 2026-05-30
**Feature Folder:** `features/PROJ-44-personal-inflations-index/`

## Dependencies
- PROJ-45: Auto-Kategorisierung von Produkten (Warenkorb-Zusammensetzung nach Kategorie)
- PROJ-39: Preis-pro-Einheit-Normalisierung (faire Vergleichsbasis)

## Overview
Ein persönlicher Verbraucherpreisindex (VPI) auf Basis des eigenen Einkaufs-Verlaufs. Die App berechnet, wie viel der eigene Warenkorb heute kostet im Vergleich zum Vorjahr — und stellt das der offiziellen Lebensmittel-Inflationsrate gegenüber. Ergebnis ist eine einzige, einprägsame Kennzahl.

**Beispiel:** „Deine persönliche Lebensmittel-Inflation: **7,4%** vs. offiziell **5,1%** (2024→2025)"

Der offizielle Vergleichswert ist ein statisch konfigurierbarer Wert — kein externer API-Call, kein Netzwerkzugriff.

## User Stories
- Als Nutzer möchte ich auf einen Blick sehen, ob meine persönliche Lebensmittel-Inflation über oder unter dem offiziellen Wert liegt, damit ich mein Einkaufsverhalten einordnen kann.
- Als Nutzer möchte ich den Inflationsindex pro Jahr vergleichen können (z.B. 2023→2024 vs. 2024→2025), damit ich Trends erkenne.
- Als Nutzer möchte ich den offiziellen Referenzwert im Konfigurations-Menü anpassen können, damit die App aktuelle Daten aus offiziellen Quellen nutzen kann.
- Als Nutzer möchte ich die Berechnungsmethode in einfacher Sprache erklärt bekommen (Tooltip/Info-Icon), damit ich dem Wert vertraue.
- Als Nutzer möchte ich den Index gefiltert nach Kategorie sehen können (z.B. nur Milchprodukte), um Kategorie-spezifische Inflation nachzuvollziehen.

## Acceptance Criteria
- [ ] Eine prominente Kennzahl „Deine Lebensmittel-Inflation" wird auf dem Statistik-Dashboard (PROJ-5) als neue Card angezeigt.
- [ ] Der Index vergleicht immer zwei vollständige Kalenderjahre (oder gleitend die letzten 12 Monate vs. die 12 Monate davor) — konfigurierbar per Dropdown.
- [ ] Berechnungsmethode: Laspeyres-Index — gleiche Produktmenge (Vorjahreswarenkorb) zum aktuellen vs. Vorjahrespreis bewertet.
- [ ] Der offizielle Referenzwert (Destatis Lebensmittel-VPI) ist im Konfigurations-Menü (PROJ-22) pro Jahr einstellbar; Standardwerte für 2022–2025 sind vorbelegt.
- [ ] Der Delta zum offiziellen Wert wird farblich hervorgehoben: grün wenn persönliche Inflation < offiziell, rot wenn > offiziell.
- [ ] Ein Tooltip/Info-Icon erklärt in 2–3 Sätzen, wie der Index berechnet wird.
- [ ] Kategorie-Filter: Nutzer kann den Index auf eine einzelne Kategorie einschränken.
- [ ] Wenn weniger als 6 Monate Daten für beide Perioden vorhanden sind, wird der Index mit einem Warnhinweis „Datenbasis zu klein für verlässliche Aussage" angezeigt.
- [ ] Produkte ohne Preishistorie in beiden Perioden werden aus der Berechnung ausgeschlossen (kein Phantomprodukt-Effekt).
- [ ] Ausgeblendete Produkte (`excluded_from_stats = true`) werden nicht einbezogen.

## Edge Cases
- **Nur ein Jahr Daten:** Kein Jahresvergleich möglich → Hinweis „Importiere Bons aus mindestens zwei verschiedenen Jahren für diesen Vergleich."
- **Starke Warenkorb-Verschiebung zwischen Jahren:** Neue Produkte im Folgejahr, die im Basisjahr nicht vorkamen, werden mit dem aktuellen Preis in beiden Perioden bewertet (Paasche-Approximation als Fallback).
- **Produkt mit nur einem Kauf pro Periode:** Preis gilt als repräsentativ für die Periode (kein Durchschnitt nötig).
- **Mehrere Supermärkte:** Alle Ketten werden zusammengefasst; Store-spezifischer Filter ist nicht vorgesehen (zu komplex für MVP).
- **Keine Kategorisierung:** Wenn PROJ-45 nicht läuft, funktioniert der Gesamt-Index trotzdem — nur der Kategorie-Filter ist deaktiviert.

## Technical Requirements
- Berechnung rein clientseitig via SQLite-Aggregation — keine Server-Komponente.
- Neue Konfigurations-Tabelle `inflation_reference_values (year INTEGER PRIMARY KEY, official_rate_percent REAL)` mit Seed-Daten (2022: 12.4, 2023: 6.4, 2024: 2.0, 2025: null).
- API-Route: `GET /api/statistiken/inflations-index?von=2024&bis=2025&kategorie=optional` → gibt `{ personal_rate, official_rate, delta, basis_products_count }` zurück.
- Card-Komponente im Statistik-Dashboard mit Sparkline (Mini-Balkendiagramm der letzten 3 Jahresvergleiche).

---
<!-- This file covers WHAT the feature does.
     Subsequent phases add their own files to this folder:
     - context-map.md  ← /architecture (tech design + file map)
     - qa-results.md   ← /qa (test results)
     - deployment.md   ← /deploy (production info)
-->
