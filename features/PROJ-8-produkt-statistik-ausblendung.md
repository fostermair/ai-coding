# PROJ-8: Produkt-Ausblendung für Statistiken

## Status: Architected
**Created:** 2026-04-11
**Last Updated:** 2026-04-11

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Produktdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt
- Requires: PROJ-5 (Statistik-Dashboard) – betroffene Statistiken

## User Stories
- Als Nutzer möchte ich ein Produkt für die Statistiken deaktivieren können, damit Pfandartikel und Leergut meine Ausgabenanalyse nicht verfälschen
- Als Nutzer möchte ich deaktivierte Produkte in der Produktliste klar erkennbar sehen, damit ich den Überblick behalte
- Als Nutzer möchte ich ein deaktiviertes Produkt wieder aktivieren können, damit ich Fehler korrigieren kann
- Als Nutzer möchte ich beim Importieren von Bons sehen, dass Pfandartikel bereits ausgeblendet sind

## Acceptance Criteria

### Deaktivierungs-Toggle in Produktliste
- [ ] Jedes Produkt in der Produktliste hat einen Toggle/Schalter "In Statistiken anzeigen" (standardmäßig aktiv)
- [ ] Deaktivierte Produkte werden in der Produktliste visuell abgedimmt/durchgestrichen dargestellt
- [ ] Status-Änderung wird sofort per API gespeichert (optimistic update)
- [ ] Filterbar: Produktliste kann nach Status gefiltert werden (Alle / Aktiv / Ausgeblendet)

### Auswirkung auf Statistiken (PROJ-5)
- [ ] Deaktivierte Produkte fließen NICHT in folgende Statistiken ein:
  - Monatliche Ausgaben (Gesamtausgaben)
  - Top-10 Produkte (Häufigkeit & Ausgaben)
  - MwSt-Kategorien-Aufteilung
- [ ] Deaktivierte Produkte fließen NICHT in den Preisentwicklungs-Chart (PROJ-4) Autocomplete ein
- [ ] Rabatt-Tracking ist NICHT betroffen (Rabatte können auch auf Pfandartikel angewendet werden — separates Tracking)
- [ ] Statistik-Dashboard zeigt einen Hinweis, wenn ausgeblendete Produkte existieren (z.B. "X Produkte ausgeblendet")

### Persistenz
- [ ] Ausblendungs-Status ist persistent in SQLite gespeichert
- [ ] Status überlebt App-Restart

## Edge Cases
- Produkt wird deaktiviert, während es aktuell im Statistik-Dashboard angezeigt wird → Dashboard refresht beim nächsten Load
- Alle Produkte werden deaktiviert → Statistiken zeigen Leer-Zustand mit passendem Hinweis
- Neues Produkt aus Bon-Import → standardmäßig aktiv (nicht automatisch deaktiviert)
- Produkt hat Alias gesetzt und wird dann deaktiviert → Alias bleibt erhalten
- Bon mit ausschließlich deaktivierten Produkten → Bon-Summe in PROJ-2 Bon-Übersicht bleibt unverändert (Bons werden nicht gefiltert, nur Statistiken)

## Technical Requirements
- Speicherung: Neue Spalte `excluded_from_stats BOOLEAN DEFAULT 0` in Tabelle `product_aliases` (oder separates Flag in `product_aliases`)
- API: `PUT /api/produkte/[name]/stats-toggle` oder Erweiterung des bestehenden PUT-Endpunkts
- Seite: Erweiterung von `src/components/product-list.tsx` (PROJ-3)
- Statistik-APIs müssen WHERE-Bedingung auf `excluded_from_stats = 0` erhalten

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Component Structure

```
ProductList (src/components/product-list.tsx — bestehend, erweitert)
+-- Summary Bar (bestehend)
|   +-- "42 Produkte • 3 ausgeblendet" (neu: Hinweis wenn ausgeblendet > 0)
|
+-- Filter-Leiste (neu, neben bestehender Suche)
|   +-- Toggle-Buttons: Alle | Aktiv | Ausgeblendet
|
+-- Produkttabelle (bestehend, erweitert)
|   +-- Neue Spalte: "Statistiken" (Switch-Toggle, Ein/Aus)
|   +-- Ausgeblendete Zeilen: abgedimmte Darstellung (opacity-50)
|
StatistikDashboard (src/components/statistik-dashboard.tsx — bestehend)
+-- Info-Badge oben rechts (neu): "3 Produkte ausgeblendet" wenn > 0
    +-- Klick → Link zur Produktseite
```

### B) Data Model

Bestehende Tabelle `product_aliases` wird um eine Spalte erweitert:

| Spalte | Typ | Standard | Bedeutung |
|--------|-----|----------|-----------|
| raw_name | Text (PK) | — | Produktname vom Bon |
| alias | Text | null | Lesbarer Name |
| updated_at | Text | — | Zeitstempel letzte Änderung |
| excluded_from_stats | Boolean (0/1) | 0 (aktiv) | Neu: ausgeblendet ja/nein |

Kein neues Schema nötig — die Spalte wird beim App-Start automatisch zur bestehenden Tabelle hinzugefügt (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Neue Produkte aus dem Bon-Import bekommen automatisch `excluded_from_stats = 0` (aktiv).

### C) Tech Decisions

| Entscheidung | Warum |
|---|---|
| **Spalte in `product_aliases`, keine neue Tabelle** | Das Flag gehört konzeptionell zur Produktkonfiguration — genau wie der Alias. Kein JOIN auf eine dritte Tabelle nötig. |
| **shadcn Switch-Komponente** | Bereits installiert. Switch ist das standard UX-Pattern für Ein/Aus-Einstellungen. Klarer als eine Checkbox, sofort verständlich. |
| **Eigener API-Endpunkt `PUT /api/produkte/[name]/exclude`** | Trennung von Alias (Text-Inhalt) und Ausblendung (boolean Flag). Klarer, testbarer, kein Multi-Purpose-Endpunkt. |
| **Filter serverseitig in SQL** | Alle Statistiken holen Daten aus dem Backend — die Filterbedingung muss dort sitzen. Frontend-Filter würden nur die Anzeige, nicht die Berechnungen korrigieren. |
| **Optimistic Update im Frontend** | Switch-Toggle fühlt sich sofort an. Bei API-Fehler wird der alte Zustand wiederhergestellt und eine Fehlermeldung angezeigt. |
| **Filterleiste als Query-Parameter** | Konsistent mit bestehendem `?sort=` Pattern. Server liefert nur gefilterte Produkte. |

### D) API-Endpunkte

| Endpunkt | Änderung |
|---|---|
| `PUT /api/produkte/[name]/exclude` | Neu: Body `{ excluded: true/false }` — setzt `excluded_from_stats` |
| `GET /api/produkte?filter=all/active/excluded` | Erweitert: neuer `filter`-Parameter + `excluded_from_stats` Feld in Response |
| `GET /api/statistiken/monatlich` | Erweitert: WHERE `excluded_from_stats = 0` in JOIN |
| `GET /api/statistiken/top-produkte` | Erweitert: WHERE `excluded_from_stats = 0` |
| `GET /api/statistiken/mwst` | Erweitert: WHERE `excluded_from_stats = 0` |
| `GET /api/statistiken/rabatte` | Unverändert (Rabatt-Tracking bleibt vollständig) |

### E) Dependencies

Keine neuen Pakete — alles bereits vorhanden:
- shadcn Switch — bereits installiert (`src/components/ui/switch.tsx`)
- better-sqlite3 — bereits installiert
- lucide-react — bereits installiert

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
