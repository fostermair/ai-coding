# PROJ-12: Artikel-Inflation (Jahr-zu-Jahr Preissteigerung)

## Status: In Progress
**Created:** 2026-04-12
**Last Updated:** 2026-04-13
**Feature Folder:** `features/PROJ-12-artikel-inflation/`

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt

## User Stories
- Als Nutzer möchte ich für jeden Artikel sehen, um wie viel Prozent er sich **pro Jahr** verteuert oder verbilligt hat, damit ich die Inflation auf Artikelebene nachvollziehen kann.
- Als Nutzer möchte ich die **durchschnittliche jährliche Preissteigerung** eines Artikels über alle verfügbaren Jahre sehen (CAGR), damit ich auf einen Blick erkenne, wie stark ein Produkt insgesamt teurer geworden ist.
- Als Nutzer möchte ich die Jahr-zu-Jahr-Veränderungen in einer Detailansicht aufgelistet sehen (z.B. im Chart-Sheet), damit ich die einzelnen Jahreswerte nachvollziehen kann.

## Acceptance Criteria

### Jahres-Durchschnittspreis
- [ ] Pro Produkt wird für jedes Kalenderjahr, in dem mindestens 1 Kauf existiert, ein Durchschnittspreis berechnet (Summe aller Preise / Anzahl Käufe)
- [ ] Der Jahres-Durchschnittspreis wird in Cent gespeichert und als Euro angezeigt (z.B. "Ø 1,29 €")

### Jahr-zu-Jahr-Veränderung
- [ ] Für jedes aufeinanderfolgende Jahrespaar wird die prozentuale Veränderung berechnet: `(Preis_Jahr_N - Preis_Jahr_N-1) / Preis_Jahr_N-1 * 100`
- [ ] Mindestens 2 Kaufjahre müssen vorhanden sein, damit eine Veränderung berechnet wird
- [ ] Fehlende Jahre (kein Kauf) werden übersprungen – kein künstliches Interpolieren

### Durchschnittliche Inflation (CAGR)
- [ ] Die durchschnittliche jährliche Preissteigerung wird als CAGR berechnet: `(Letzter_Jahrespreis / Erster_Jahrespreis) ^ (1 / Anzahl_Jahre) - 1`
- [ ] Anzeige in der Produktliste als neue Spalte "Ø Inflation p.a." (z.B. "+3,2% p.a.")
- [ ] Nur sichtbar wenn mind. 2 Kaufjahre vorliegen; sonst leer

### Detailansicht
- [ ] Im Preis-Chart-Sheet (PROJ-4) wird unter dem Chart eine Tabelle angezeigt: Jahr | Ø Preis | Veränderung ggü. Vorjahr
- [ ] Einträge mit weniger als einem vollen Jahr werden trotzdem angezeigt (mit Hinweis "Teiljahr")

## Edge Cases
- Nur 1 Kaufjahr vorhanden → keine CAGR, keine Jahresveränderung (Zelle leer)
- Preissenkung zwischen Jahren → negative Veränderung, grün dargestellt
- Gleiches Jahr, aber unterschiedliche Preise (Preisschwankung) → Durchschnitt wird gebildet
- Produkt hat Käufe in Jahr 2023 und 2025 (kein 2024) → direkter Vergleich 2023→2025 über 2 Jahre
- Leergut-Positionen (Preis ≤ 0) → aus allen Berechnungen ausgeschlossen

## Technical Requirements
- Neue API-Route: `GET /api/produkte/[name]/inflation` – gibt Jahres-Durchschnittspreise + CAGR zurück
- Erweiterung der `GET /api/produkte`-Antwort um Feld `inflation_cagr_pct` (null wenn <2 Jahre)
- Berechnung via SQLite: GROUP BY `strftime('%Y', date)`
- Anpassung `src/components/product-list.tsx`: neue Spalte "Ø Inflation p.a."
- Anpassung `src/components/price-chart-sheet.tsx`: Jahrestabelle unter dem Chart
