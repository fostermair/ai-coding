# PROJ-24: Kontoauszug-Import & Parser

**Status:** Approved  
**Created:** 2026-05-21  
**Priority:** P1  

## Feature Summary

Nutzer können Kontoauszüge ihrer Bank als PDF importieren – manuell per Datei-Upload oder automatisch via Paperless-ngx. Die App extrahiert alle Kartenzahlungen und Überweisungen und speichert sie als strukturierte Transaktionen in der Datenbank.

## Problem Statement

Die eBon-App erfasst Bons aus Supermärkten, hat aber keine Verknüpfung zu den tatsächlichen Kontoabbuchungen. Ohne Kontoauszug-Import fehlt ein wichtiger Kontrollpunkt: War der Einkauf wirklich auf dem Konto? Gibt es Ausgaben ohne Bon? Der Kontoauszug schließt diese Lücke.

## Goals

1. **PDF-Parser für Bankkontoauszüge:** Unterstützung des erkannten Formats (N3/Pocket-Konto, DD.MM.-Datum, negative Beträge)
2. **Zwei Import-Wege:** Manueller Upload (Datei-Dialog) + Paperless-ngx API-Sync
3. **Strukturierte Speicherung:** Alle Transaktionen in neuer Tabelle `bank_transactions`
4. **Duplikat-Schutz:** Gleicher Auszug kann nicht zweimal importiert werden
5. **Fehlertoleranz:** Unbekannte Zeilen werden geloggt, Import läuft weiter

## Bankformat (ermittelt aus `data/konto/Auszug.txt`)

- **Bank:** N3 / Volksbank Pocket-Konto
- **Header:** Kontoinhaber, IBAN, BIC, Periode (`Vorläufiger Kontoauszug MM/YYYY`), Saldo
- **Transaktionsstruktur:** 2 Zeilen pro Transaktion
  - Zeile 1: `Buchungsdatum | Valutadatum | Transaktionstyp + Händler/Empfänger | Betrag`
  - Zeile 2: Ergänzende Infos (IBAN/BIC bei Überweisungen, Adresszeile bei Kartenzahlungen)
- **Datumsformat:** `DD.MM.` (Jahr aus Auszugs-Header)
- **Betragsformat:** `-49,08 €` (negativ = Ausgabe, positiv = Einnahme)
- **Transaktionstypen:**
  - `Kartenzahlung` — Händlername im Beschreibungsfeld (z.B. `KAUFLAND PADERBORN 470`)
  - `Echtzeitüberweisung` — Empfängername + Verwendungszweck + IBAN/BIC in Zeile 2
  - `Überweisung` — wie Echtzeitüberweisung

## User Stories

### US1: Manueller Kontoauszug-Import (Datei-Upload)
**Als** Nutzer  
**Möchte ich** eine Kontoauszug-PDF hochladen  
**Um** alle meine Kontoabbuchungen in der App zu sehen  

**Akzeptanzkriterien:**
- Upload-Dialog (auf Import-Seite oder Einstellungen) ermöglicht PDF-Auswahl
- Alle Kartenzahlungen und Überweisungen werden korrekt extrahiert
- Zusammenfassung nach Import: X Transaktionen importiert, Y Fehler, Z Duplikate
- Import-Log-Eintrag wird erstellt

### US2: Paperless-ngx Kontoauszug-Sync
**Als** Nutzer  
**Möchte ich** Kontoauszüge automatisch aus Paperless-ngx abrufen  
**Um** keinen manuellen Upload durchführen zu müssen  

**Akzeptanzkriterien:**
- Neuer Endpunkt `POST /api/konto/paperless-sync`
- Konfigurierbar via `.env.local`: `PAPERLESS_KONTO_DOCUMENT_TYPE_ID`
- Gleicher Import-Flow wie manueller Upload
- Fehler bei ungültigem Token werden klar gemeldet

### US3: Duplikat-Erkennung
**Als** Nutzer  
**Möchte ich** den gleichen Auszug mehrmals hochladen können, ohne Duplikate zu erzeugen  
**Um** keine doppelten Einträge zu haben  

**Akzeptanzkriterien:**
- Eindeutige Identifikation über: `IBAN + Periode (YYYY-MM)`
- Zweiter Import des gleichen Auszugs → `status=duplicate`, keine neuen Einträge
- Nutzer sieht klare Meldung: "Kontoauszug für 05/2026 bereits importiert"

### US4: Fehlertoleranz bei unbekannten Transaktionen
**Als** Nutzer  
**Möchte ich**, dass der Import bei einzelnen Parse-Fehlern nicht abbricht  
**Um** auch Auszüge mit unbekannten Transaktionstypen verarbeiten zu können  

**Akzeptanzkriterien:**
- Nicht erkannte Zeilen werden als `typ=sonstige` gespeichert
- Fehler werden in Import-Log protokolliert
- Import läuft mit restlichen Transaktionen weiter

## Datenbank-Schema

```sql
CREATE TABLE bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buchungsdatum TEXT NOT NULL,         -- YYYY-MM-DD
  valutadatum TEXT,                    -- YYYY-MM-DD
  typ TEXT NOT NULL,                   -- kartenzahlung | überweisung | gutschrift | sonstige
  beschreibung TEXT NOT NULL,          -- Rohtext der Transaktionsbeschreibung
  haendler_name TEXT,                  -- extrahierter Händlername (bei Kartenzahlung)
  empfaenger_name TEXT,                -- extrahierter Empfänger (bei Überweisung)
  verwendungszweck TEXT,               -- Verwendungszweck (bei Überweisung)
  iban TEXT,                           -- IBAN des Empfängers/Auftraggebers
  bic TEXT,
  betrag_cents INTEGER NOT NULL,       -- in Cent, negativ = Ausgabe
  kontoauszug_datei TEXT,              -- Dateiname der Quelldatei
  periode TEXT NOT NULL,               -- YYYY-MM (aus Auszugs-Header)
  konto_iban TEXT,                     -- eigene IBAN aus Auszugs-Header
  importiert_am TEXT NOT NULL          -- ISO 8601 Timestamp
);

-- Duplikat-Schutz: eine Transaktion = eindeutig über Datum + Betrag + Beschreibung innerhalb einer Periode
CREATE UNIQUE INDEX idx_bank_tx_unique 
  ON bank_transactions(konto_iban, buchungsdatum, betrag_cents, beschreibung);

-- Duplikat-Schutz für Kontoauszüge
CREATE TABLE bank_statement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  konto_iban TEXT NOT NULL,
  periode TEXT NOT NULL,
  dateiname TEXT,
  importiert_am TEXT NOT NULL,
  transaktion_count INTEGER
);
CREATE UNIQUE INDEX idx_bank_stmt_unique ON bank_statement_log(konto_iban, periode);
```

## Acceptance Criteria

1. Alle Kartenzahlungen aus `data/konto/Auszug.txt` werden korrekt extrahiert (Datum, Händler, Betrag)
2. Alle Überweisungen werden korrekt extrahiert (Datum, Empfänger, Verwendungszweck, IBAN, Betrag)
3. Gutschriften (positive Beträge) werden als `typ=gutschrift` importiert
4. Unbekannte Transaktionstypen werden als `typ=sonstige` gespeichert
5. Duplikat-Erkennung: gleicher Auszug (IBAN + Periode) wird nicht zweimal importiert
6. Mehrseitige Auszüge (Seite 1 von N) werden vollständig verarbeitet
7. Jahr-Überlauf (Dezember → Januar) wird korrekt behandelt
8. Import wird in `import_log` protokolliert
9. Paperless-Sync funktioniert mit `PAPERLESS_KONTO_DOCUMENT_TYPE_ID`
10. Fehler einzelner Transaktionen brechen den Gesamt-Import nicht ab

## Edge Cases

| Szenario | Verhalten |
|----------|-----------|
| Mehrseitige Auszüge | Alle Seiten werden verarbeitet, Header-Infos von Seite 1 verwendet |
| Jahr-Überlauf (z.B. Dezember-Auszug mit Januar-Buchungen) | Datum wird korrekt auf nächstes Jahr gesetzt |
| Gutschriften / positive Beträge | Als `typ=gutschrift` importiert |
| Unbekannte Transaktionstypen | Als `typ=sonstige` gespeichert, Warnung im Log |
| Gleicher Auszug erneut hochgeladen | `status=duplicate`, keine neuen Einträge |
| PDF ist nicht lesbar | Klarer Fehler: "PDF konnte nicht verarbeitet werden" |
| Kein `PAPERLESS_KONTO_DOCUMENT_TYPE_ID` gesetzt | Paperless-Sync disabled, Fehlermeldung |
| Paperless-Token abgelaufen | Klare Fehlermeldung: "Authentifizierung fehlgeschlagen" |
| Transaktion fehlt Valutadatum | Valutadatum = Buchungsdatum als Fallback |

## API-Endpunkte

- `POST /api/konto/import` — manueller Upload (FormData mit PDF-File)
  - Response: `{ imported: number, duplicates: number, errors: number, periode: string }`
- `POST /api/konto/paperless-sync` — Sync aus Paperless
  - Response: gleiche Struktur wie manueller Import

## Neue Dateien

- `src/lib/parser/konto.ts` — PDF-Parser für Kontoauszüge
- `src/app/api/konto/import/route.ts` — Upload-Endpunkt
- `src/app/api/konto/paperless-sync/route.ts` — Paperless-Sync-Endpunkt

## Geänderte Dateien

- `src/lib/db.ts` — neue Tabellen `bank_transactions` + `bank_statement_log` + Migrations

## Dependencies

**Requires:**
- PROJ-1 (import_log Infrastruktur)
- PROJ-18 (Paperless-Integration als Vorlage, optional für Sync)

**Enables:**
- PROJ-25 (Bon-Kontoauszug Abgleich — baut auf dieser Tabelle auf)

## Out of Scope

- Unterstützung anderer Bankformate (nur N3/Pocket in v1)
- Automatischer Import beim App-Start
- Kategorisierung von Transaktionen
- Budgetplanung oder Soll/Ist-Vergleich

## Success Metrics

- [ ] Alle Transaktionen aus `data/konto/Auszug.txt` werden korrekt geparst
- [ ] Duplikat-Schutz funktioniert (zweiter Upload ändert nichts)
- [ ] Import-Log enthält verständliche Zusammenfassung
- [ ] Paperless-Sync funktioniert mit konfigurierter Env-Var
