# PROJ-11: Preistrend letzte 12 Monate

## Status: Approved
**Created:** 2026-04-12
**Last Updated:** 2026-04-12
**Feature Folder:** `features/PROJ-11-preistrend-12-monate/`

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt
- Erweitert: PROJ-10 (Preistrend-Indikator) – bestehenden Badge anpassen

## User Stories
- Als Nutzer möchte ich in der Produktliste sehen, wie sich der Preis eines Artikels in den **letzten 12 Monaten** verändert hat, damit ich aktuelle Preistrends erkenne (nicht den Trend über alle Jahre).
- Als Nutzer möchte ich, wenn weniger als 12 Monate Daten vorliegen, trotzdem einen Trend sehen – basierend auf dem verfügbaren Zeitraum, damit ich auch für neuere Produkte einen Hinweis bekomme.
- Als Nutzer möchte ich im Tooltip/Hinweis sehen, auf welchem Zeitraum der angezeigte Trend basiert, damit ich die Aussagekraft einschätzen kann.

## Acceptance Criteria

### Zeitfenster-Logik
- [ ] Der Trend-Badge in der Produktliste berechnet die Preisveränderung vom ältesten Kauf **innerhalb der letzten 12 Monate** bis zum neuesten Kauf
- [ ] Liegt der älteste Kauf weniger als 12 Monate zurück, wird der gesamte verfügbare Zeitraum verwendet
- [ ] Hat ein Produkt nur einen Kauf in den letzten 12 Monaten → kein Badge (auch wenn ältere Käufe existieren)
- [ ] Liegt der letzte Kauf eines Produkts länger als 12 Monate zurück → kein Badge (Produkt gilt als inaktiv für diesen Trend)

### Anzeige
- [ ] Badge zeigt weiterhin: Richtungspfeil + prozentuale Veränderung (Format wie PROJ-10: "↑ 12,3%")
- [ ] Tooltip am Badge zeigt den berechneten Zeitraum: z.B. "Apr 2025 – Apr 2026"
- [ ] Farben wie PROJ-10: rot (↑), grün (↓), grau (→ 0%)

### Performance
- [ ] Berechnung in einer einzigen SQL-Query (kein N+1), Filterung nach Datum in der DB
- [ ] Ladezeit der Produktseite erhöht sich um maximal 200ms gegenüber PROJ-10

## Edge Cases
- Alle Käufe eines Produkts sind gleich alt (z.B. alle am selben Tag) → 0%-Badge
- Produkt wurde zuletzt vor 13 Monaten gekauft → kein Badge
- Produkt hat 2 Käufe: erster vor 11 Monaten, zweiter heute → normaler Trend auf 11 Monate
- Leergut-Positionen (Preis ≤ 0) → werden ausgeschlossen
- Sonderpreis/Rabatt-Einkauf → tatsächlich gezahlter Preis wird verwendet

## Technical Requirements
- Änderung der Trend-Berechnung in `src/app/api/produkte/route.ts`: WHERE-Clause auf `date >= DATE('now', '-12 months')`
- Neue API-Felder: `trend_from_date`, `trend_to_date` (ISO-String) für Tooltip
- Anpassung `src/components/product-list.tsx`: Tooltip mit Zeitraum am Badge
- Kein Breaking Change an der API-Struktur (neue Felder sind additiv)
