# Product Requirements Document

## Vision
Eine lokale Web-App zur Analyse von REWE eBons (PDF). Die App extrahiert automatisch alle Kassenbons, baut eine Produktdatenbank auf und ermöglicht die Auswertung von Preisentwicklungen, Einkaufsgewohnheiten und Ausgaben – ohne Cloud, ohne Account, vollständig lokal.

## Target Users
**Privatpersonen**, die regelmäßig bei REWE einkaufen und ihre Ausgaben besser verstehen wollen.
- **Bedürfnis:** Überblick über tatsächliche Ausgaben, Preisveränderungen bei Stammprodukten nachvollziehen, Einkaufsgewohnheiten analysieren
- **Pain Points:** Kein Tool versteht das REWE eBon-Format; manuelle Auswertung in Excel ist mühsam; Produktnamen auf dem Bon sind unleserliche Abkürzungen

## Core Features (Roadmap)

| Priority | Feature | Status |
|----------|---------|--------|
| P0 (MVP) | eBon Import & Parser (PDF → SQLite) | Planned |
| P0 (MVP) | Bon-Übersicht & Detailansicht | Planned |
| P0 (MVP) | Produktdatenbank & Alias-Verwaltung | Planned |
| P1 | Preisentwicklungs-Chart | Planned |
| P1 | Statistik-Dashboard | Planned |
| P1 | Watch-Folder Auto-Import | Planned |
| P1 | Produkt-Ausblendung für Statistiken (Pfand) | Planned |
| P1 | Preissteigerungs-Analyse (Jahr-zu-Jahr + Gesamt) | Planned |
| P1 | Preistrend-Indikator in Produktliste | Planned |
| P1 | Preistrend letzte 12 Monate | Planned |
| P1 | Artikel-Inflation (Jahr-zu-Jahr Preissteigerung) | Planned |
| P1 | Ausgeblendete Artikel als separater Tab | Planned |
| P2 | Saisonale Artikel-Markierung | Planned |
| P2 | Datenexport (Excel & CSV) | Planned |
| P1 | Einkaufskorb-Vergleich (Vorjahr + Voreinkauf) | Planned |
| P1 | Monatlicher Ausgaben-Langzeittrend | Planned |

## Success Metrics
- Alle 3 Beispiel-eBons werden korrekt importiert und geparst (0 Fehler)
- Produktnamen können via Alias auf lesbare Namen gemappt werden
- Preisentwicklung eines Produkts über mehrere Bons ist als Chart sichtbar
- Export als .xlsx und .csv funktioniert

## Constraints
- **Lokal only:** Keine Cloud, kein Backend-Server, SQLite als Datenbank
- **Single-User:** Kein Authentifizierungssystem nötig
- **Format:** Nur REWE eBons (PDF mit maschinell lesbarem Text)
- **Plattform:** Läuft lokal via `npm run dev` im Browser

## Non-Goals
- Unterstützung anderer Supermärkte (Aldi, Lidl, etc.) – nicht in v1
- Mobile App
- Cloud-Sync oder Multi-Device
- OCR für gescannte (nicht-digitale) PDFs
- Budgetplanung oder Soll/Ist-Vergleich
