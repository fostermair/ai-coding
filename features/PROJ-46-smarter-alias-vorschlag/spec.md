# PROJ-46: Smarter Alias-Vorschlag beim Import

**Status:** Architected
**Created:** 2026-05-29
**Last Updated:** 2026-05-29
**Priority:** P1 (Sprint 1 — Daten-Qualitäts-Fundament)
**Feature Folder:** `features/PROJ-46-smarter-alias-vorschlag/`

## Feature Summary

Beim Import jedes neuen `raw_name` (ohne vorhandenen Alias) wird ein Alias-Vorschlag berechnet, indem die Match-Logik aus PROJ-19 (`src/lib/avis-matching.ts`, Levenshtein + Token-Set-Similarity) gegen alle bereits aliasierten `raw_name`s läuft. Der Top-Kandidat wird mit Konfidenz angezeigt und kann per Klick übernommen werden.

## Problem Statement

Heute muss jeder neue `raw_name` (z. B. `BUTTER LANDLIEBE 250GR` neben bereits aliasiertem `BUTTER LANDLIEBE 250G`) manuell aliasiert werden — obwohl die Ähnlichkeit offensichtlich ist. Pflegeaufwand bleibt hoch, ungemappte Artikel akkumulieren sich, Analysen werden ungenau.

## Goals

1. **Automatischer Vorschlag** für neue `raw_name`s anhand existierender Aliases.
2. **Wiederverwendung** der bestehenden Match-Logik aus PROJ-19 — keine neue Library, keine Doppelimplementierung.
3. **Confirm-Step** statt Auto-Speichern: Nutzer entscheidet immer.
4. **Source-Tracking:** Übernommene Vorschläge sind als `source='suggested'` erkennbar (für Audit / spätere Auswertung).

## User Stories

### US1: Vorschlag in der Import-Ergebnis-Ansicht
**Als** Nutzer
**möchte ich** beim ersten Auftauchen eines neuen `raw_name` einen Alias-Vorschlag inkl. Konfidenz sehen,
**damit** ich nur noch bestätigen statt tippen muss.

**Akzeptanzkriterien:**
- Import-Ergebnis-Dialog zeigt pro neuem `raw_name` eine Zeile: `raw_name | Vorschlag | Konfidenz | [Übernehmen] [Anderer Alias] [Überspringen]`.
- Konfidenz wird als Prozentwert (0–100) angezeigt.
- Bei Konfidenz ≥ 90 % ist der Vorschlag vorausgewählt, aber niemals auto-gespeichert.

### US2: Ablehnen oder manuelle Eingabe
**Als** Nutzer
**möchte ich** Vorschläge ablehnen oder einen abweichenden Alias eingeben können,
**damit** der Vorschlag mich nie zwingt.

**Akzeptanzkriterien:**
- Klick auf "Anderer Alias" → Inline-Eingabefeld, eigener Alias wird gespeichert.
- Klick auf "Überspringen" → kein Alias gesetzt, `raw_name` bleibt ungemappt.
- Übernommene Aliase landen mit `source='suggested'` in `product_aliases`.

### US3: Performance bei vielen Aliasen
**Als** Nutzer
**möchte ich**, dass auch bei großer Alias-Datenbank die Vorschläge schnell berechnet werden,
**damit** der Import nicht spürbar verzögert wird.

**Akzeptanzkriterien:**
- Bei >5000 vorhandenen Aliasen bleibt die Vorschlagsberechnung pro Import-Batch < 2 s.
- Berechnung läuft serverseitig, nicht im Browser.

## Acceptance Criteria (zusammengefasst)

1. Für jeden neuen `raw_name` ohne Eintrag in `product_aliases` wird beim Import der Top-Vorschlag berechnet.
2. Matching nutzt `src/lib/avis-matching.ts` (Levenshtein + Token-Set-Similarity); keine neue Match-Library.
3. Vorschlag wird in der Import-Ergebnis-Ansicht angezeigt; nichts wird automatisch ohne Bestätigung gespeichert.
4. `product_aliases` bekommt eine neue NULL-fähige Spalte `source TEXT` mit Werten `'manual' | 'suggested' | 'avis' | NULL` (default NULL für bestehende, manuelle Einträge).
5. Übernommene Vorschläge werden mit `source='suggested'` gespeichert.
6. API-Endpoint `POST /api/aliases/suggest` (oder Integration in die bestehende Import-Response) liefert pro `raw_name` `{ suggestion: string | null, confidence: number }`.
7. Bestehende manuelle Aliase werden niemals durch Vorschläge überschrieben.

## Edge Cases

| Szenario | Verhalten |
|---|---|
| Keine ähnlichen `raw_name`s vorhanden (leere DB / sehr unterschiedliches Produkt) | Eingabefeld leer, kein Vorschlag, Konfidenz `0` |
| Mehrere Kandidaten mit gleicher Konfidenz | Erster nach `raw_name`-Reihenfolge (deterministisch) |
| Nutzer importiert denselben Bon nochmal | Vorschläge nur für `raw_name`s ohne Alias; bereits aliasiertes bleibt unangetastet |
| Vorschlag mit sehr niedriger Konfidenz (< 50 %) | Anzeige als Vorschlag mit Hinweis "niedrige Konfidenz", nicht vorausgewählt |
| Nutzer übernimmt Vorschlag, ändert sich später → manuell überschreiben | Manuelle Änderung setzt `source='manual'`, überschreibt `'suggested'` |

## Technical Notes

- Reuse: `src/lib/avis-matching.ts` exportiert bereits eine Match-Funktion (siehe PROJ-19); ggf. eine dünne Wrapper-Funktion `suggestAlias(rawName: string, existingAliases: Array<{raw_name: string, alias: string}>): { suggestion: string | null, confidence: number }`.
- Berechnung läuft im Backend (Node.js), nicht im Browser.
- Cache-Möglichkeit: Aliase einmal pro Import-Request laden, nicht pro Item.
- UI-Komponente kann sich an `avis-confirmation-dialog.tsx` (PROJ-19) orientieren.

## Dependencies

**Requires:** PROJ-3 (Alias-System mit `product_aliases`-Tabelle).
**Reuse:** PROJ-19 Match-Logik aus `src/lib/avis-matching.ts`.
**Ermöglicht:** PROJ-47 (Bulk-Worklist nutzt dieselbe Vorschlags-Engine).

## Out of Scope

- Bulk-Anwendung mehrerer Vorschläge auf einmal — das ist PROJ-47.
- Vorschläge auf Basis von AVIS-Inhalten — das ist PROJ-19, bereits umgesetzt.
- Lernende / adaptive Vorschläge (z. B. abhängig von Häufigkeit) — out of scope für Sprint 1.

## Success Metrics

- [ ] Bei den 4 Test-eBons werden für mind. 70 % der neuen `raw_name`s sinnvolle Vorschläge mit Konfidenz ≥ 80 % erzeugt.
- [ ] False-Positive-Rate (übernommener Vorschlag, der manuell zurückgenommen wird) < 10 %.
- [ ] Import-Dauer wächst durch Vorschlagsberechnung um < 25 % bei 5000 vorhandenen Aliasen.
