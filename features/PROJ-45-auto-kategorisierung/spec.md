# PROJ-45: Auto-Kategorisierung von Produkten

**Status:** Architected
**Created:** 2026-05-29
**Last Updated:** 2026-05-29
**Priority:** P1 (Sprint 1 — Daten-Qualitäts-Fundament)
**Feature Folder:** `features/PROJ-45-auto-kategorisierung/`

## Feature Summary

Regelbasierte Engine, die jedem Produkt beim Import automatisch eine Kategorie zuordnet (Milchprodukte, Brot & Backwaren, Pfand, …). Kategorien sind die Voraussetzung für Kategorien-Inflation (PROJ-38), Treemap (PROJ-40), Substitutions-Erkennung (PROJ-41) und Spar-Alerts (PROJ-42). Ersetzt langfristig das manuelle `excluded_from_stats`-Flag auf Produktebene (PROJ-8) durch Default-Ausschlüsse pro Kategorie.

## Problem Statement

Heute existiert keine Kategorisierung. Alle Statistiken arbeiten auf Einzelartikel-Ebene, was Aussagen wie "Milchprodukte +9% YoY" unmöglich macht. Manuelle Excludes (Pfand, Tabak) müssen pro Alias gesetzt werden — fehleranfällig und mühsam. Ohne Kategorien bleibt jede tiefere Analyse oberflächlich.

## Goals

1. **Automatik beim Import:** Jeder Artikel ohne manuelle Kategorie wird beim Import regelbasiert einsortiert.
2. **Manuelles Override:** Nutzer kann pro Produkt die Kategorie überschreiben; Override bleibt bei Reimport erhalten.
3. **Kategorie-Defaults:** Ausschluss aus Statistiken wird Kategorie-Eigenschaft (Pfand, Tabak, Drogerie default `excluded`), nicht mehr Produkt-Flag.
4. **Versioniertes Regelwerk:** Patterns liegen als Datei im Repo, sind reviewbar und änderbar.
5. **Fallback:** Kein Treffer → Kategorie `Sonstiges`, niemals leer.

## User Stories

### US1: Auto-Kategorisierung beim Import
**Als** Nutzer
**möchte ich**, dass neue Produkte beim Import automatisch einer Kategorie zugeordnet werden,
**damit** ich nicht jeden Alias manuell einsortieren muss.

**Akzeptanzkriterien:**
- Beim Import jedes neuen `raw_name`/`alias` wird das Regelwerk durchlaufen.
- Erstes passendes Pattern gewinnt; ohne Treffer → Kategorie `Sonstiges`.
- Kategorie wird in `product_categories` mit `source='auto'` gespeichert.

### US2: Manuelles Override
**Als** Nutzer
**möchte ich** falsche Auto-Kategorisierungen pro Produkt überschreiben können,
**damit** meine Analysen stimmen.

**Akzeptanzkriterien:**
- In der `/produkte`-Detailansicht gibt es ein Kategorie-Dropdown.
- Eine manuelle Auswahl setzt `source='manual'`.
- Bei späterem Reimport bleibt `source='manual'` unverändert.

### US3: Default-Ausschluss per Kategorie
**Als** Nutzer
**möchte ich** Default-Ausschlüsse pro Kategorie (Pfand, Tabak, Drogerie),
**damit** Statistiken sofort sinnvoll sind, ohne pro Produkt ein Flag setzen zu müssen.

**Akzeptanzkriterien:**
- Kategorien tragen eine Eigenschaft `default_excluded_from_stats: boolean`.
- Statistik-Queries respektieren diese Eigenschaft.
- Vorhandene `product_aliases.excluded_from_stats=1` werden bei Migration als Override beibehalten (überschreibt Kategorie-Default `false`).

### US4: Kategorie-Übersicht in /produkte
**Als** Nutzer
**möchte ich** in der Produktliste die Kategorie pro Zeile sehen,
**damit** ich Inkonsistenzen schnell erkenne.

**Akzeptanzkriterien:**
- Neue Spalte `Kategorie` in der Produktliste, sortier- und filterbar (PROJ-15-konform).
- Zeile zeigt Kategorie + visueller Hinweis bei `source='auto'` vs. `source='manual'`.

## Acceptance Criteria (zusammengefasst)

1. Regelwerk lebt in einer versionierten Datei (YAML/JSON in `src/lib/categorization/rules.*`), Patterns matchen gegen `raw_name` und `alias`.
2. Tabelle `product_categories(alias TEXT PRIMARY KEY, category TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('auto','manual')), updated_at TEXT)` existiert nach Migration.
3. Standard-Kategorien-Set mind.: Milchprodukte, Brot & Backwaren, Obst, Gemüse, Fleisch & Wurst, Tiefkühl, Getränke, Süßwaren, Drogerie, Pfand, Tabak, Sonstiges.
4. Beim Import wird Auto-Kategorisierung ausgeführt; manuelle Einträge bleiben unangetastet.
5. Statistiken nutzen `default_excluded_from_stats` der Kategorie statt `product_aliases.excluded_from_stats` (letzteres bleibt als Override-Quelle bestehen).
6. UI in `/produkte`-Detail erlaubt manuelles Setzen einer Kategorie.
7. Import-Log nennt die Anzahl auto-kategorisierter / unkategorisierter Artikel.
8. Re-Run der Auto-Kategorisierung auf vorhandenen Daten ist über einen Button "Alle neu kategorisieren (nur Auto)" anstoßbar, ohne manuelle Einträge zu berühren.

## Edge Cases

| Szenario | Verhalten |
|---|---|
| Mehrere Patterns matchen gleichzeitig | Erstes Match in der Reihenfolge des Regelwerks gewinnt (Reihenfolge = Priorität) |
| Alias eines Produkts wird nachträglich geändert | Auto-Kategorisierung wird neu vorgeschlagen, sofern `source='auto'`; bei `source='manual'` unverändert |
| Neues Produkt hat noch keinen Alias | Patterns matchen gegen `raw_name` |
| Bestehende `product_aliases.excluded_from_stats=1` | Bei Migration als Override beibehalten — Statistik schließt das Produkt weiterhin aus, auch wenn die Kategorie es eigentlich einschließen würde |
| Regelwerk wird geändert / Datei aktualisiert | Bestehende Einträge mit `source='auto'` werden beim nächsten Import oder per Re-Run aktualisiert; `source='manual'` bleibt |
| Pattern enthält Unicode/Umlaute | Matching ist case-insensitive und unicode-aware |

## Technical Notes

- Datei z. B. `src/lib/categorization/rules.yaml` (oder `.json`, wenn YAML-Dependency vermieden werden soll — Entscheidung in `/architecture`).
- Datenstruktur eines Regeleintrags (Vorschlag): `{ pattern: string (regex), category: string, priority?: number }`.
- Kategorien-Metadaten (mind. `default_excluded_from_stats: boolean`, optional `color: string`) liegen ebenfalls im Repo, idealerweise in derselben Datei oder als separate `categories.yaml`.
- `product_categories.alias` als FK-artige Referenz auf `product_aliases.raw_name` ist denkbar — finale Modellierung in `/architecture`.
- Migration: bestehende Aliase werden beim ersten App-Start gegen das Regelwerk gelaufen und in `product_categories` mit `source='auto'` eingetragen.

## Dependencies

**Requires:** keine harten Abhängigkeiten — kann sofort starten.
**Berührt funktional:** PROJ-3 (Alias-System), PROJ-8 (Excluded-Flag — wird langfristig abgelöst).
**Ermöglicht:** PROJ-38 (Kategorien-Inflation), PROJ-40 (Treemap), PROJ-41 (Substitutionen), PROJ-42 (Spar-Alerts), PROJ-49 (Drill-Down).

## Out of Scope

- LLM-/Embedding-basierte Klassifizierung (gegen Lokal-Only-Constraint).
- Saisonal-Auto-Detect (`seasonal`-Flag bleibt unangetastet in Sprint 1; späteres Aufräumen laut ROADMAP §7).
- UI zum Editieren des Regelwerks selbst — die Datei wird vom Entwickler im Repo gepflegt.
- Automatische Vorschläge für neue Kategorien aus den Daten.

## Success Metrics

- [ ] ≥ 80 % der vorhandenen Aliase werden beim ersten Auto-Run einer Kategorie ≠ `Sonstiges` zugeordnet.
- [ ] Pfand, Tabak und Drogerie sind nach Migration default aus Statistiken ausgeschlossen.
- [ ] Manuelle Kategorie-Zuweisung in `/produkte`-Detail funktioniert und überlebt einen Reimport.
- [ ] Anzahl manuell zu setzender `excluded_from_stats`-Flags geht gegen 0 für die Standardfälle.
