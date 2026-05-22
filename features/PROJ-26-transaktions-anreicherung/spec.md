# PROJ-26: Transaktions-Anreicherung

**Status:** Approved  
**Created:** 2026-05-22  
**Dependencies:** PROJ-24 (Kontoauszug-Import), PROJ-25 (Bon-Kontoauszug-Abgleich)

---

## Übersicht

Transaktionen aus dem Kontoauszug können mit lesbaren Aliases, Händler-Logos und einem Ausblend-Toggle angereichert werden.

---

## Feature 1: Globaler Transaktions-Alias

### User Stories
- Als Nutzer möchte ich für eine Transaktionsbeschreibung (z.B. "REWE SAGT DANKE 12345 BERLIN") einen lesbaren Alias (z.B. "REWE Schöneberg") vergeben, damit die Transaktion überall verständlich angezeigt wird.
- Als Nutzer möchte ich, dass der Alias **global** gilt: alle Transaktionen mit identischer `beschreibung` zeigen denselben Alias.
- Als Nutzer möchte ich einen Alias direkt aus der Transaktionsliste oder dem Bon-Detail bearbeiten können.
- Als Nutzer möchte ich einen Alias wieder löschen können.

### Akzeptanzkriterien
- [ ] Neue Tabelle `transaction_aliases` (beschreibung TEXT PK, alias TEXT, logo_path TEXT, updated_at TEXT)
- [ ] Alias wird in Transaktionsliste anstelle von haendler_name/beschreibung angezeigt (falls gesetzt)
- [ ] Alias-Bearbeitung direkt in der Transaktionsliste (Inline-Edit oder Dialog)
- [ ] Alias gilt für alle Transaktionen mit derselben `beschreibung`
- [ ] Alias-Löschung möglich

### Edge Cases
- Zwei Transaktionen mit identischer `beschreibung` zeigen denselben Alias → korrekt
- Keine `beschreibung` vorhanden → kein Alias (kein Fehler)
- Alias leer gespeichert → behandeln wie "kein Alias"

---

## Feature 2: Händler-Logo pro Alias

### User Stories
- Als Nutzer möchte ich ein Logo/Badge-Bild für einen Transaktions-Alias hochladen können, das in der Bonansicht erscheint.
- Als Nutzer möchte ich, dass das Logo global für alle Transaktionen mit diesem Alias gilt.

### Akzeptanzkriterien
- [ ] Bild-Upload im Alias-Dialog (PNG/JPG, max. 500 KB)
- [ ] Bild wird lokal unter `public/badges/` gespeichert (Dateiname: slug des Alias)
- [ ] In der Bonansicht (bon-detail.tsx) wird das Logo angezeigt, wenn ein Alias mit Logo gesetzt ist
- [ ] Logo-Pfad wird in `transaction_aliases.logo_path` gespeichert
- [ ] Vorhandenes Edeka-Badge (`public/badges/edeka.png`) kann als Beispiel/Referenz genutzt werden

### Edge Cases
- Kein Bild hochgeladen → kein Logo angezeigt (kein Fehler)
- Upload einer zu großen Datei → Fehlermeldung
- Alias gelöscht → Logo bleibt in `public/badges/` (wird nicht automatisch gelöscht)

---

## Feature 3: Transaktions-Ausblend-Toggle

### User Stories
- Als Nutzer möchte ich eine Transaktion mit einem Toggle ausblenden können, um Fehlbuchungen (z.B. Rückbuchungen, Testbuchungen) aus der Anzeige zu entfernen.
- Als Nutzer möchte ich ausgeblendete Transaktionen aus Statistiken und Auswertungen ausschließen.
- Als Nutzer möchte ich ausgeblendete Transaktionen in einer separaten Ansicht oder mit einem Filter wieder sehen können.
- Als Nutzer möchte ich eine ausgeblendete Transaktion wieder einblenden können.

### Akzeptanzkriterien
- [ ] Neues Feld `hidden` (INTEGER DEFAULT 0) in `bank_transactions`-Tabelle (via Migration)
- [ ] Toggle-Button in der Transaktionsliste pro Transaktion
- [ ] Ausgeblendete Transaktionen werden standardmäßig nicht in der Liste angezeigt
- [ ] Filter/Tab "Ausgeblendet" zeigt ausgeblendete Transaktionen an
- [ ] Ausgeblendete Transaktionen werden in Statistiken (Monatssummen, Auswertungen) nicht berücksichtigt
- [ ] API-Query filtert `WHERE hidden = 0` (oder lässt sich per Parameter umschalten)

### Edge Cases
- Transaktion ist bereits gematcht (`matched`) und wird ausgeblendet → Match bleibt erhalten, Transaktion nur aus Statistik ausgeschlossen
- Ausgeblendete Transaktion wieder einblenden → erscheint wieder in Liste und Statistik
- Abgrenzung zu `match_status = 'ignored'`: `ignored` = kein Match gefunden/nicht relevant für Matching; `hidden = 1` = nutzergesteuerte Ausblendung aus Anzeige und Statistik
