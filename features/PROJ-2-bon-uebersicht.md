# PROJ-2: Bon-Übersicht & Detailansicht

## Status: In Progress

## Implementation Notes (Frontend)
- Übersichtsseite (`src/app/page.tsx`) mit `BonList` Client-Komponente
- `src/components/bon-list.tsx`: Tabelle aller Bons, Summary-Header (Anzahl + Ausgaben), Datumsfilter (Von/Bis), Empty State, Loading/Error States
- Detailansicht (`src/app/bon/[id]/page.tsx`) mit `BonDetailView` Client-Komponente
- `src/components/bon-detail.tsx`: Bon-Header (Card), Produkt-Tabelle mit eingerückten Rabatten (rot), Pfand/Leergut-Gruppe, MwSt-Aufschlüsselung, Löschen mit AlertDialog-Bestätigung
- `src/lib/format.ts`: Shared Utilities für Euro-Formatierung (Cent→Euro) und Datumsformatierung
- Responsive: Spalten verstecken auf Mobile (sm/md Breakpoints)
- Paket: `date-fns` installiert
**Created:** 2026-04-07
**Last Updated:** 2026-04-08

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Bons müssen in der DB vorhanden sein

## User Stories
- Als Nutzer möchte ich alle importierten Bons in einer sortierten Liste sehen, damit ich einen Überblick habe
- Als Nutzer möchte ich einen Bon anklicken können, um alle Einzelpositionen zu sehen
- Als Nutzer möchte ich Bons nach Datum filtern können, damit ich Einkäufe in einem Zeitraum finden kann
- Als Nutzer möchte ich einen Bon löschen können, damit ich Fehlimporte bereinigen kann
- Als Nutzer möchte ich in der Detailansicht sehen, welche Rabatte auf welche Produkte angewendet wurden

## Acceptance Criteria
- [ ] Übersichtsseite zeigt alle Bons als Tabelle/Liste: Datum, Uhrzeit, Markt, Bon-Nr., Anzahl Artikel, Summe, Zahlungsart
- [ ] Liste ist standardmäßig nach Datum absteigend sortiert (neueste zuerst)
- [ ] Filterung nach Datumsbereich möglich (Von-Bis Datepicker)
- [ ] Klick auf einen Bon öffnet Detailansicht
- [ ] Detailansicht zeigt: alle Produktzeilen mit Name (Alias wenn vorhanden), Menge, Einzelpreis, Gesamtpreis, MwSt-Code
- [ ] Rabatte werden direkt unter dem zugehörigen Produkt angezeigt (eingerückt, negativ, rot)
- [ ] Pfand- und Leergut-Positionen werden als eigene Gruppe dargestellt
- [ ] MwSt-Aufschlüsselung (A/B) am Ende der Detailansicht sichtbar
- [ ] Bon kann aus der Detailansicht gelöscht werden (mit Bestätigungs-Dialog)
- [ ] Gesamt-Anzahl importierter Bons und Gesamtausgaben als Summary-Header sichtbar

## Edge Cases
- Keine Bons importiert → leere Liste mit Hinweis "Noch keine Bons importiert – verwende den Import"
- Bon mit negativer Summe (Leergut-Rückgabe) → wird korrekt mit "-" in der Liste angezeigt
- Detailansicht für Bon mit Konzessionär-Artikel → separater Block mit Konzessionär-Info
- Filtern ergibt keine Treffer → leere Liste mit Hinweis

## Technical Requirements
- Seite: `src/app/page.tsx` (Hauptseite = Bon-Übersicht)
- Detailansicht: `src/app/bon/[id]/page.tsx`
- Daten via API Route: `GET /api/bons` und `GET /api/bons/[id]`
- DELETE: `DELETE /api/bons/[id]`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Designed:** 2026-04-08

---

### Komponenten-Struktur (Übersichtsseite `/`)

```
Bon-Übersicht Seite
+-- Summary-Header (Anzahl Bons, Gesamtausgaben)
+-- Filter-Leiste
|   +-- Datepicker "Von" (Kalender-Popup)
|   +-- Datepicker "Bis" (Kalender-Popup)
|   +-- Reset-Button (Filter zurücksetzen)
+-- Bon-Tabelle (sortiert nach Datum absteigend)
|   +-- Spalten: Datum, Uhrzeit, Markt, Bon-Nr., Artikel, Summe, Zahlungsart
|   +-- Zeile klickbar → navigiert zur Detailansicht
+-- Leerer Zustand (wenn keine Bons / Filter ohne Treffer)
```

### Komponenten-Struktur (Detailansicht `/bon/[id]`)

```
Bon-Detailansicht
+-- Zurück-Link (← Zurück zur Übersicht)
+-- Bon-Header (Datum, Uhrzeit, Markt, Adresse, Bon-Nr., Zahlungsart)
+-- Positionen-Tabelle
|   +-- Produktgruppe (item_type = product/concession)
|   |   +-- Produkt-Zeile: Name (Alias wenn vorhanden), Menge, Einzelpreis, Gesamtpreis, MwSt
|   |   +-- Rabatt-Zeile (eingerückt, rot, negativ) — wenn Rabatt vorhanden
|   +-- Pfand/Leergut-Gruppe (separater Abschnitt)
|       +-- PFAND-Zeilen (positiv)
|       +-- LEERGUT-Zeilen (negativ)
+-- MwSt-Aufschlüsselung (A=19%, B=7% mit Netto/Steuer/Brutto)
+-- Aktionen
    +-- Löschen-Button → Bestätigungs-Dialog (AlertDialog)
```

---

### Datenfluss

**Übersichtsseite:**
- Lädt alle Bons via `GET /api/bons` (mit optionalen Query-Parametern `from` und `to` für Datumsfilter)
- Antwort enthält: Liste der Bons mit Zusammenfassung (Datum, Markt, Artikelanzahl, Summe) + Gesamtstatistik (Anzahl Bons, Gesamtausgaben)

**Detailansicht:**
- Lädt einzelnen Bon via `GET /api/bons/[id]`
- Antwort enthält: Bon-Header-Daten + alle Positionen mit zugeordneten Rabatten + Alias-Namen aus `product_aliases`
- Löschen via `DELETE /api/bons/[id]` → mit Bestätigung → zurück zur Übersicht

---

### Datenmodell (Bestandsdaten aus PROJ-1)

Alle Daten kommen aus der bestehenden SQLite-Datenbank (`data/ebon.db`):
- **receipts** — Bon-Kopfdaten (Datum, Markt, Summe, Zahlungsart)
- **receipt_items** — Einzelpositionen (Produktname, Preis, Menge, MwSt, Typ)
- **item_discounts** — Rabatte pro Position (Beschreibung, Betrag)
- **product_aliases** — Nutzer-definierte Lesbar-Namen (wird in Detailansicht genutzt)

Keine neuen Tabellen nötig.

---

### API-Routen

```
GET  /api/bons          → Alle Bons (optional: ?from=YYYY-MM-DD&to=YYYY-MM-DD)
GET  /api/bons/[id]     → Einzelner Bon mit allen Positionen + Rabatten
DELETE /api/bons/[id]    → Bon löschen (CASCADE löscht auch Positionen + Rabatte)
```

---

### shadcn/ui-Komponenten (bereits installiert)

| Komponente | Verwendung |
|---|---|
| `Table` | Bon-Liste und Positions-Tabelle |
| `Button` | Aktionen, Filter, Navigation |
| `Badge` | Zahlungsart, MwSt-Code |
| `Card` | Bon-Header in Detailansicht |
| `AlertDialog` | Lösch-Bestätigung |
| `Popover` | Datepicker-Container |
| `Separator` | Visueller Trenner zwischen Gruppen |
| `Skeleton` | Lade-Zustand |

---

### Neue Abhängigkeit

| Paket | Zweck |
|---|---|
| `date-fns` | Datumsformatierung (DE-Locale) und Bereichs-Logik für Filter |

---

### Tech-Entscheidungen

| Entscheidung | Gewählt | Begründung |
|---|---|---|
| Datepicker | Eigener Datepicker aus `Popover` + nativer `<input type="date">` | shadcn hat keinen eingebauten Datepicker; ein nativer Input ist einfach, barrierefrei und benötigt keine Extra-Library |
| Geldbeträge | Cent → Euro-Formatierung erst im Frontend | DB speichert Cent (Integer), Frontend konvertiert für Anzeige — konsistent mit PROJ-1 |
| Sortierung | Serverseitig in SQL | Performanter als Client-Sortierung, konsistente Reihenfolge |
| Seitenstruktur | `/` als Übersicht, `/bon/[id]` als Detail | Konform mit PROJ-1 Navigation (`/` = Bons) |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
