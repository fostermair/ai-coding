# PROJ-37: HelloFresh Zahlungsverlauf Import & Tab

## Status: Approved
**Created:** 2026-05-29
**Last Updated:** 2026-05-29
**Feature Folder:** `features/PROJ-37-hellofresh-import/`

## Dependencies
- Requires PROJ-24 (Kontoauszug-Import) — bestehende Transaktionsansicht mit Tab-Struktur
- Requires PROJ-36 (Transaktions-Kategorien) — Tab-Pattern als Referenz

---

## Kontext & Datenformat

JSON-Quelle: `data/hellofresh/hellofresh_zahlungsverlauf.json`

Felder pro Eintrag:
| Feld | Typ | Beispiel |
|------|-----|---------|
| Datum | `"DD.MM.YYYY"` | `"29.04.2026"` |
| Bestellnummer | string | `"2717345546"` |
| Produkt | string | `"Classic Box"`, `"Feinschmecker Gericht"`, `"Free Add On"` |
| Portionen | number \| null | `15`, `null` |
| Personen | number \| null | `3`, `null` |
| Grundpreis | number | `87.0` |
| Liefergebühren | number | `5.99` |
| Rabatt | number (negativ) | `-34.8` |
| HelloFresh Cash | number (negativ) | `0.0`, `-11.67` |
| Gesamt | number | `58.19` |
| Status | string | `"Bezahlt"`, `"Erstattet"` |

Bekannte Produkttypen:
- **Box-Typen** (haben Portionen/Personen): Classic Box, Classic-Abo, Veggie Box - Thermomix Rezept, Classic Box - Thermomix Rezept
- **Extras** (Portionen/Personen = null): Feinschmecker Gericht, AddOn Desserts, Free Add On

---

## User Stories

1. Als Nutzer möchte ich den HelloFresh Zahlungsverlauf per Knopfdruck importieren, damit die Bestellhistorie in der App sichtbar ist.
2. Als Nutzer möchte ich unter „Transaktionen" einen eigenen Tab „HelloFresh" sehen, damit ich den Zahlungsverlauf getrennt vom Kontoauszug betrachten kann.
3. Als Nutzer möchte ich alle HelloFresh-Bestellungen chronologisch absteigend in einer Tabelle sehen (Datum, Produkt, Portionen, Personen, Grundpreis, Rabatt, HelloFresh Cash, Gesamt, Status).
4. Als Nutzer möchte ich eine Zusammenfassung oben im Tab sehen (Anzahl Bestellungen, Gesamtausgaben, Ø pro Lieferung), damit ich einen schnellen Überblick habe.
5. Als Nutzer möchte ich erneut importieren können (Re-Import), ohne Duplikate zu erzeugen — bestehende Datensätze werden dann aktualisiert.

---

## Acceptance Criteria

### Import
- [ ] Auf der Import-Seite gibt es unter einem eigenen Reiter „HelloFresh" eine Schaltfläche „Zahlungsverlauf importieren"
- [ ] Der Import liest `data/hellofresh/hellofresh_zahlungsverlauf.json` serverseitig ein
- [ ] Alle Felder werden korrekt in die SQLite-Tabelle `hellofresh_transactions` geschrieben
- [ ] Duplizierung wird über die `Bestellnummer` verhindert (UPSERT)
- [ ] Nach erfolgreichem Import wird Anzahl importierter/aktualisierter Einträge angezeigt
- [ ] Fehler (Datei nicht gefunden, ungültiges JSON) werden dem Nutzer klar gemeldet

### Transaktionen-Tab
- [ ] In der Transaktionsansicht erscheint ein Tab „HelloFresh" neben den bestehenden Tabs
- [ ] Der Tab zeigt eine Summary-Leiste: Anzahl Bestellungen, Gesamtausgaben (Gesamt-Summe), Ø Gesamt pro Box-Bestellung (Extras ausgenommen)
- [ ] Tabelle mit Spalten: Datum | Produkt | Portionen | Personen | Grundpreis | Rabatt | HF Cash | Gesamt | Status
- [ ] Zeilen mit Status „Erstattet" sind visuell hervorgehoben (z. B. gedämpfte Farbe + Badge)
- [ ] Spalte „Portionen" und „Personen" zeigen „–" wenn null
- [ ] Tabelle ist sortierbar nach Datum (Standard: neueste zuerst)
- [ ] Wenn noch keine Daten importiert wurden, erscheint ein leerer State mit Hinweis auf Import-Seite
- [ ] Geldbeträge werden im Euro-Format dargestellt (z. B. `58,19 €`)

---

## Edge Cases

- **Leere JSON-Datei / fehlende Datei:** API antwortet mit klarem Fehler, kein Crash
- **Negative Gesamt-Werte** (z. B. vollständig erstattete Bestellungen mit Gesamt = 0): werden korrekt dargestellt
- **Extras ohne Portionen/Personen:** Felder bleiben null in DB, Tab zeigt „–"
- **Doppelter Import:** UPSERT auf `Bestellnummer` — keine Duplikate, aktualisiert geänderte Felder
- **Sehr große Datensätze:** Tabelle wird clientseitig paginiert oder virtuell gescrollt wenn > 100 Einträge
- **HelloFresh Cash als negativer Betrag:** wird in der Tabelle als Abzug dargestellt (roter Text oder separates Format)

---

## Technical Requirements

- **Neue DB-Tabelle:** `hellofresh_transactions` in `src/lib/db.ts`
- **Neues API-Route:** `POST /api/hellofresh/import` (liest Datei serverseitig, führt UPSERT durch)
- **Neues API-Route:** `GET /api/hellofresh/transactions` (gibt alle Einträge zurück)
- **Neues UI-Component:** `hellofresh-transaction-list.tsx` (Tab-Inhalt)
- **Import-Tab:** Neuer Reiter auf `/import`-Seite analog zu bestehenden Import-Reitern (PROJ-34)
- **Kein Upload nötig:** JSON-Datei liegt lokal auf dem Server unter `data/hellofresh/`

---

<!-- HOW wird in context-map.md durch /architecture beschrieben -->
