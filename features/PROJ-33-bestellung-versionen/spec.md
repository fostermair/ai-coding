# PROJ-33: Mehrere Bestellungen pro Bon — zusammengeführte Produktbasis

## Status: Planned

**Created:** 2026-05-27
**Dependencies:** PROJ-32 (Bestellbestätigung-Import & Produktmengen-Verknüpfung)

---

## Problem

REWE erzeugt für jede Änderung einer Online-Bestellung eine neue Bestellbestätigung-PDF mit derselben Bestellnummer. PROJ-32 geht davon aus, dass es genau eine Bestellbestätigung pro Bestellnummer gibt — der Duplicate-Check blockiert jeden weiteren Import. In der Praxis existieren jedoch mehrere PDFs pro Bestellnummer, wenn Artikel nachträglich geändert, entfernt oder hinzugefügt wurden.

---

## Lösung

Duplikat-Check per `order_number` entfernen. Alle importierten Bestellbestätigungen zur selben Bestellnummer werden als gemeinsame Produktbasis zusammengeführt. Die vereinigte, deduplizierte Artikelliste dient für das Artikel-Matching gegen den Bon.

---

## User Stories

**US-1:** Als Nutzer kann ich mehrere Bestellbestätigung-PDFs mit derselben Bestellnummer importieren, ohne dass der zweite Import blockiert wird.

**US-2:** Als Nutzer sehe ich im Bon-Detail alle Artikel aus allen importierten Bestellbestätigungen zur erkannten Bestellnummer — als vollständige, zusammengeführte Liste.

**US-3:** Als Nutzer wird im Bestellung-Tab das PDF der zuletzt importierten Bestellbestätigung angezeigt.

---

## Acceptance Criteria

### AC-1: Import ohne Duplikat-Block
- [ ] Mehrere PDFs mit gleicher Bestellnummer können nacheinander importiert werden
- [ ] Jeder Import erzeugt einen eigenen `import_log`-Eintrag mit den zugehörigen `bestellung_items`
- [ ] Der bisherige Duplikat-Check auf `order_number` entfällt (sowohl manueller Upload als auch Paperless-Sync)

### AC-2: Zusammengeführte Artikelliste im Bon-Detail
- [ ] Das Bon-Detail aggregiert die `bestellung_items` aller `import_log`-Einträge zur erkannten Bestellnummer
- [ ] Identische Artikel (gleicher `article_name` + gleiche `quantity_amount` + gleiche `quantity_unit`) erscheinen nur einmal in der Ergebnisliste
- [ ] Das Artikel-Matching (Fuzzy-Match gegen Bon-Positionen) läuft gegen diese zusammengeführte Liste

### AC-3: PDF-Anzeige
- [ ] Im Bestellung-Tab wird das PDF des `import_log`-Eintrags mit dem neuesten `created_at` zur erkannten Bestellnummer angezeigt
- [ ] Kein UI zur Versionsauswahl notwendig

### AC-4: Bon-Matching unverändert
- [ ] Das Matching von Bon zu Bestellnummer (Datum + Betrag) funktioniert wie bisher
- [ ] Ist eine Bestellnummer gefunden, werden alle zugehörigen `import_log`-Einträge für die Artikelbasis herangezogen
- [ ] `has_bestellung`-Flag im Bon bleibt unverändert

### AC-5: Paperless-Sync
- [ ] Beim Paperless-Sync wird ebenfalls kein Duplikat-Block per `order_number` ausgelöst
- [ ] Jedes neu synchronisierte Dokument zur gleichen Bestellnummer wird als eigener Eintrag gespeichert

---

## Edge Cases

| Szenario | Verhalten |
|----------|-----------|
| Erster Import einer Bestellnummer | Wie bisher — ein `import_log`-Eintrag, alle Artikel in `bestellung_items` |
| Zweiter Import, identische Artikel | Deduplizierung ergibt dieselbe Artikelliste — kein visueller Unterschied |
| Zweiter Import, ein Artikel weniger (storniert) | Artikel aus erstem Import bleibt in der Basis; `matched_receipt_item_id = null` wenn kein Bon-Treffer |
| Zweiter Import, neuer Artikel | Neuer Artikel erscheint in der zusammengeführten Liste und wird für Matching berücksichtigt |
| Gleicher PDF-Inhalt zweimal importiert | Kein expliziter Hash-Check — beide Einträge werden gespeichert; Deduplizierung auf Artikelebene verhindert doppelte Listeneinträge |

---

## Nicht im Scope

- Versions-Anzeige oder -Navigation im UI (kein „Version 2 von 3")
- Automatischer Diff zwischen Bestellversionen
- Anzeige, aus welcher Bestellung ein Artikel stammt
- Lösch-Funktion für einzelne Bestellversionen (Gesamt-Löschen via Config-Menü bleibt wie in PROJ-32)

---

## Betroffene Dateien (vorläufig)

| Datei | Änderung |
|-------|----------|
| `src/app/api/bestellung/import/route.ts` | Duplikat-Check per `order_number` entfernen |
| `src/app/api/paperless/bestellung-sync/route.ts` | Duplikat-Check per `order_number` entfernen |
| `src/app/api/bons/[id]/route.ts` | Artikelabfrage aggregiert über alle `import_log`-Einträge zur Bestellnummer |
| `src/app/api/bons/[id]/bestellung-pdf/route.ts` | PDF des neuesten `import_log`-Eintrags zur Bestellnummer ausliefern |
| `src/app/api/bons/route.ts` | `has_bestellung`-Flag ggf. anpassen (falls Query betroffen) |
