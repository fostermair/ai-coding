# PROJ-4: Preisentwicklungs-Chart

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Alias-Namen für lesbare Chart-Titel

## User Stories
- Als Nutzer möchte ich die Preisentwicklung eines Produkts über Zeit als Linien-Chart sehen, damit ich Preissteigerungen erkenne
- Als Nutzer möchte ich das Produkt über eine Suchfunktion auswählen können, damit ich schnell das richtige Produkt finde
- Als Nutzer möchte ich sehen, an welchem Datum welcher Preis gezahlt wurde (Tooltip), damit ich genaue Daten nachschauen kann
- Als Nutzer möchte ich erkennen können, ob Rabatte den Preis beeinflusst haben, damit ich Netto- vs. Brutto-Preis vergleiche

## Acceptance Criteria
- [ ] Produktauswahl via Suchfeld mit Autocomplete (Rohname + Alias)
- [ ] Linien-Chart zeigt Kaufpreis (Brutto) des Produkts über Zeit (X-Achse: Datum, Y-Achse: EUR)
- [ ] Jeder Datenpunkt im Chart ist ein tatsächlicher Kauf (mit Datum und Preis)
- [ ] Tooltip bei Hover zeigt: Datum, Preis, Bon-Nr., Markt
- [ ] Wenn Rabatt angewendet wurde: Datenpunkt visuell markiert (z.B. anderer Farbpunkt) und Tooltip zeigt Originalpreis + Rabatt
- [ ] Chart-Titel zeigt Alias (wenn vorhanden) oder Rohname
- [ ] Mindestens 2 Datenpunkte nötig für Chart; bei nur 1 Kauf: Hinweistext "Nur ein Kauf vorhanden – kein Trend darstellbar"
- [ ] Zeitachse korrekt skaliert (auch wenn Käufe Monate auseinanderliegen)

## Edge Cases
- Produkt wurde nur einmal gekauft → Hinweis statt Chart
- Produkt wurde mit unterschiedlichen Mengen gekauft → Chart zeigt immer Einzelpreis pro Stück (nicht Gesamtpreis)
- Preis ist 0 oder negativ (Leergut) → solche Einträge aus dem Chart ausschließen
- Sehr viele Kaufdaten (50+ Punkte) → Chart bleibt performant und lesbar

## Technical Requirements
- Seite: `src/app/produkte/[name]/page.tsx` oder integriert in Produktseite als Modal/Drawer
- Chart-Library: `recharts` (bereits im Next.js Ökosystem verbreitet)
- API: `GET /api/produkte/[name]/preise` → gibt Array von {datum, preis, einzelpreis, rabatt, bon_nr} zurück

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
