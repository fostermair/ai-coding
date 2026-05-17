# PROJ-16: Einkaufskorb-Vergleich

## Status: Architected
**Created:** 2026-05-17
**Last Updated:** 2026-05-17
**Feature Folder:** `features/PROJ-16-einkaufskorb-vergleich/`

## Dependencies
- PROJ-1 (eBon Import & Parser – Produktdaten und Bon-Daten)
- PROJ-3 (Produktdatenbank & Alias – Produktidentifikation)

## User Stories
- Als Nutzer möchte ich sehen, um wie viel sich mein letzter Einkauf (nur gemeinsame Produkte) gegenüber denselben Produkten vor einem Jahr verteuert oder verbilligt hat, damit ich Inflation in meinem Warenkorb direkt spüren kann.
- Als Nutzer möchte ich sehen, wie sich mein letzter Einkauf gegenüber dem vorherigen Einkauf (nur gemeinsame Produkte) preislich verändert hat, damit ich kurzfristige Preisschwankungen erkennen kann.
- Als Nutzer möchte ich wissen, wie viele Produkte in den Vergleich eingeflossen sind, damit ich die Aussagekraft des Vergleichs einschätzen kann.

## Acceptance Criteria

### Vorjahres-Vergleich (Letzter Einkauf vs. ~365 Tage zuvor)
- [ ] Die App zeigt: Summe der gemeinsamen Produkte im letzten Einkauf vs. ihre Preise ~1 Jahr zuvor (±30 Tage Toleranzfenster, nächstgelegener Kauf)
- [ ] Anzeige: Differenz in EUR (absolut) und Prozent, farbcodiert (rot = teurer, grün = günstiger)
- [ ] Anzeige: Anzahl der gemeinsamen Produkte die verglichen wurden (z.B. "8 von 12 Produkten im Vergleich")
- [ ] Falls keine Produkte aus dem letzten Einkauf vor ~1 Jahr gekauft wurden: Hinweis "Keine Vorjahresdaten verfügbar"

### Vorheriger-Einkauf-Vergleich
- [ ] Die App zeigt: Summe der gemeinsamen Produkte im letzten Einkauf vs. ihre Preise im unmittelbar vorherigen Einkauf
- [ ] Anzeige: Differenz in EUR (absolut) und Prozent, farbcodiert
- [ ] Anzeige: Anzahl der gemeinsamen Produkte
- [ ] Falls kein vorheriger Einkauf existiert: Hinweis "Nur ein Einkauf vorhanden"

### Allgemein
- [ ] Beide Vergleiche sind auf dem Statistik-Dashboard als neue Karte(n) sichtbar
- [ ] Ausgeblendete Produkte (PROJ-8) werden aus dem Vergleich ausgeschlossen
- [ ] Alias-Namen werden zur Produktidentifikation verwendet (PROJ-3)

## Edge Cases
- Produkt kommt im Vorjahr nicht vor → wird aus dem Vergleich ausgeschlossen (kein Fehler)
- Produkt hat im Vergleichszeitraum mehrere Käufe → der preislich nächste Kauf zum Zieldatum wird verwendet
- Letzter Einkauf hat 0 gemeinsame Produkte mit Vorjahr → "Keine Vorjahresdaten verfügbar"
- Nur ein einziger Einkauf in der Datenbank → Vorjahresvergleich und Voreinkauf-Vergleich beide nicht verfügbar
- Produkt wurde mit Rabatt gekauft → tatsächlich bezahlter Preis (unit_price_cents) wird verwendet

## Technical Requirements
- Performance: < 300ms Response-Zeit (SQLite-Abfrage mit Joins)
- Berechnung serverseitig (API-Route), nicht im Frontend
