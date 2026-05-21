# PROJ-25: Bon-Kontoauszug Abgleich & Visualisierung

**Status:** Approved  
**Created:** 2026-05-21  
**Priority:** P1  

## Feature Summary

Importierte Kontotransaktionen (PROJ-24) werden mit vorhandenen eBons abgeglichen. Gematchte Bons erhalten einen Indikator in der Detailansicht. Nicht gematchte Transaktionen erzeugen einen "virtuellen Bon", der in der Bon-Übersicht erscheint und die Gesamtausgaben vervollständigt.

## Problem Statement

Nach dem Kontoauszug-Import (PROJ-24) liegen Transaktionen und Bons isoliert vor. Der Nutzer kann nicht auf einen Blick sehen, welcher Einkauf welcher Abbuchung entspricht – und Einkäufe ohne eBon sind in der Gesamtauswertung unsichtbar. Dieses Feature schließt diese Lücke durch automatisches Matching und virtuelle Bons.

## Goals

1. **Automatisches Matching:** Kontotransaktion ↔ Bon nach Datum + Betrag + Händlername
2. **Visualisierung:** Gematchter Bon zeigt Badge "Kontoposition vorhanden" in der Detailansicht
3. **Virtuelle Bons:** Nicht gematchte Transaktionen erscheinen als Bon-ähnlicher Eintrag
4. **Manuelle Zuordnung:** Nutzer kann Transaktionen manuell einem Bon zuweisen
5. **Vollständige Gesamtausgaben:** Statistiken berücksichtigen auch virtuelle Bons

## Matching-Logik

```
Für jede Kontotransaktion (typ = kartenzahlung | überweisung):
  1. Suche Bons mit receipt_date ∈ [buchungsdatum-1, buchungsdatum+1]
     UND total_amount_cents == |betrag_cents|
  2. Händlername-Check:
     - Kartenzahlung: REWE/LIDL/KAUFLAND in beschreibung → store_chain muss passen
     - Überweisung: Händlername in verwendungszweck prüfen
  3. Erstes eindeutiges Ergebnis → auto-match (match_status = 'matched')
  4. Mehrere Kandidaten → zur manuellen Auswahl anbieten (match_status = 'pending')
  5. Kein Kandidat → virtuellen Bon anlegen (match_status = 'virtual')
```

**Toleranz:** ±1 Tag (Valutadatum vs. Kassendatum)  
**Zuordnung:** 1:1 (eine Transaktion → ein Bon)  
**Betrag-Abweichung:** Keine Toleranz beim Auto-Match (exakte Übereinstimmung); bei manueller Zuordnung frei wählbar

## User Stories

### US1: Automatisches Matching nach Import
**Als** Nutzer  
**Möchte ich**, dass nach dem Kontoauszug-Import automatisch nach passenden Bons gesucht wird  
**Um** keine manuellen Zuordnungen vornehmen zu müssen  

**Akzeptanzkriterien:**
- Matching läuft automatisch nach jedem Kontoauszug-Import
- Ergebnis-Dialog zeigt: X automatisch gematcht | Y zur manuellen Auswahl | Z als virtueller Bon
- Matching kann manuell erneut ausgelöst werden (z.B. wenn neue Bons nachgepflegt wurden)

### US2: Kontoposition-Badge in Bon-Detailansicht
**Als** Nutzer  
**Möchte ich** in der Bon-Detailansicht sehen, ob eine Kontoabbuchung zugeordnet ist  
**Um** die Zahlung bestätigt zu sehen  

**Akzeptanzkriterien:**
- Gematchter Bon zeigt Badge: "Kontoabbuchung: -49,08 € (19.05.2026)"
- Badge verlinkt zur Transaktion (oder zeigt Details in Tooltip)
- Bon ohne Kontoposition zeigt kein Badge (kein "fehlt"-Indikator, da Bon-only OK ist)

### US3: Virtueller Bon für nicht gematchte Transaktionen
**Als** Nutzer  
**Möchte ich**, dass Einkäufe ohne Bon trotzdem in der Übersicht erscheinen  
**Um** meine Gesamtausgaben vollständig zu sehen  

**Akzeptanzkriterien:**
- Virtuelle Bons erscheinen in der Bon-Übersicht (visuell abgegrenzt, z.B. gestrichelter Rahmen + Icon)
- Virtueller Bon zeigt: Händlername (aus Transaktionsbeschreibung), Datum, Gesamtbetrag
- Keine Einzelpositionen, keine Detailansicht mit Artikeln
- Label "Kein Bon vorhanden" oder "Nur Kontoauszug"
- Virtuelle Bons fließen in Gesamtausgaben-Statistik ein

### US4: Manuelle Zuordnung von Transaktionen
**Als** Nutzer  
**Möchte ich** eine Transaktion manuell einem Bon zuordnen können  
**Um** Fälle zu lösen, bei denen kein Auto-Match möglich war  

**Akzeptanzkriterien:**
- In der Transaktions-Übersicht oder Bon-Detailansicht gibt es eine "Zuordnen"-Aktion
- User wählt aus einer Liste passender Bons (gefiltert nach Datum ±7 Tage)
- Zuordnung ersetzt ggf. einen virtuellen Bon
- Manuell zugeordnete Matches können wieder aufgehoben werden

### US5: Re-Matching wenn neue Bons importiert werden
**Als** Nutzer  
**Möchte ich**, dass virtuellen Bons verschwinden, wenn ich später den echten eBon importiere  
**Um** keine Duplikate zu haben  

**Akzeptanzkriterien:**
- Nach jedem Bon-Import: Prüfung ob eine offene Transaktion dazu passt
- Passendes Ergebnis → virtuellen Bon entfernen, Transaktion mit echtem Bon verknüpfen
- Kein Datenverlust: bereits manuell zugeordnete Matches bleiben

### US6: Gesamtausgaben inkl. virtuelle Bons
**Als** Nutzer  
**Möchte ich**, dass das Dashboard virtuelle Bons in der Ausgaben-Summe berücksichtigt  
**Um** meine echten Gesamtausgaben zu sehen  

**Akzeptanzkriterien:**
- Monats- und Jahresausgaben im Dashboard: echte Bons + virtuelle Bons
- Virtuelle Bons werden in der Auflistung mit eigenem Icon/Label markiert
- Statistik-Filter kann virtuelle Bons ein-/ausblenden

## Datenbank-Änderungen

```sql
-- Erweiterung receipts-Tabelle
ALTER TABLE receipts ADD COLUMN is_virtual INTEGER DEFAULT 0;  -- 1 = virtueller Bon
ALTER TABLE receipts ADD COLUMN bank_transaction_id INTEGER REFERENCES bank_transactions(id);

-- Matching-Status in bank_transactions
ALTER TABLE bank_transactions ADD COLUMN match_status TEXT DEFAULT 'unmatched';
  -- Werte: unmatched | matched | pending | virtual | ignored
ALTER TABLE bank_transactions ADD COLUMN matched_receipt_id INTEGER REFERENCES receipts(id);
ALTER TABLE bank_transactions ADD COLUMN match_source TEXT;
  -- Werte: auto | manual
```

## Acceptance Criteria

1. Kartenzahlung bei REWE/Lidl/Kaufland wird automatisch dem passenden Bon zugeordnet (Datum ±1 Tag + gleicher Betrag)
2. Überweisung mit Händlername im Verwendungszweck wird korrekt gematcht
3. Gematchter Bon zeigt Badge in Detailansicht mit Betrag und Datum der Abbuchung
4. Transaktion ohne passenden Bon erzeugt virtuellen Bon in der Bon-Übersicht
5. Virtuelle Bons sind visuell klar von echten Bons unterscheidbar
6. Gesamtausgaben im Dashboard (PROJ-5) schließt virtuelle Bons ein
7. Manuelle Zuordnung funktioniert: Transaktion → Bon auswählen → Zuordnung gespeichert
8. Re-Matching: Nach Import eines neuen echten Bons wird passender virtueller Bon entfernt
9. Mehrere Kandidaten → zur manuellen Auswahl anbieten (kein Auto-Match bei Ambiguität)
10. Manuell zugeordnete Matches bleiben bei erneutem Auto-Matching erhalten

## Edge Cases

| Szenario | Verhalten |
|----------|-----------|
| Mehrere Bons am selben Tag beim gleichen Händler mit gleichem Betrag | Alle als Kandidaten anbieten, kein Auto-Match |
| Betrag im Bon ≠ Betrag auf Kontoauszug (z.B. Trinkgeld) | Kein Auto-Match, Kandidaten zur manuellen Auswahl |
| Gutschrift (positiver Betrag) | Kein Bon-Matching, kein virtueller Bon; nur in Transaktionsliste |
| Transaktion `typ=sonstige` | Kein Auto-Match, optional manuell zuordnen |
| Echter Bon kommt nach virtuellem Bon | Virtueller Bon wird ersetzt, Transaktion mit echtem Bon verknüpft |
| Virtueller Bon manuell zugeordnet, echter Bon importiert | Manuell zugeordneter Match bleibt bestehen |
| Transaktion bereits gematcht, erneutes Matching | Bestehender Match bleibt, kein Überschreiben |
| Transaktion `match_status=ignored` | Wird vom Matching übersprungen |

## UI-Komponenten

- **Bon-Detailansicht:** Badge "Kontoabbuchung: -49,08 € (19.05.)" bei gematchten Bons
- **Bon-Übersicht:** Virtueller Bon mit gestricheltem Rahmen, Icon (z.B. Kreditkarte), Label "Nur Kontoauszug"
- **Transaktionsliste:** Neue Seite oder Tab zeigt alle `bank_transactions` mit Match-Status
- **Zuordnungs-Dialog:** Bon-Suche mit Datumsfilter, Betrag-Anzeige, Bestätigungs-Button
- **Dashboard (PROJ-5):** Gesamtausgaben-Chart berücksichtigt virtuelle Bons (visuell markiert)

## API-Endpunkte

- `POST /api/konto/match` — Matching für alle offenen Transaktionen ausführen
- `GET /api/konto/transactions` — Liste aller Kontotransaktionen mit Match-Status
- `POST /api/konto/transactions/[id]/assign` — manuelle Zuordnung zu einem Bon
- `DELETE /api/konto/transactions/[id]/assign` — Zuordnung aufheben

## Neue Dateien

- `src/app/api/konto/match/route.ts` — Matching-Logik
- `src/app/api/konto/transactions/route.ts` — Transaktionsliste
- `src/app/api/konto/transactions/[id]/assign/route.ts` — manuelle Zuordnung
- `src/components/bank-transaction-badge.tsx` — Kontoposition-Badge in Bon-Detailansicht
- `src/components/virtual-receipt-card.tsx` — Virtueller Bon in Übersicht

## Geänderte Dateien

- `src/lib/db.ts` — Neue Spalten in `receipts` und `bank_transactions`
- `src/app/api/import/route.ts` — Nach Bon-Import: Re-Matching anstoßen
- Bon-Detailansicht-Komponente — Badge einbinden
- Bon-Übersicht-Komponente — Virtuelle Bons anzeigen
- Dashboard-Statistik — Virtuelle Bons in Ausgaben einberechnen

## Dependencies

**Requires:**
- PROJ-24 (Kontoauszug-Import — liefert `bank_transactions`-Tabelle)
- PROJ-2 (Bon-Übersicht & Detailansicht — wird erweitert)
- PROJ-5 (Statistik-Dashboard — wird um virtuelle Bons ergänzt)

## Out of Scope

- Automatischer Abgleich beim App-Start
- Mehrere Kontotransaktionen einem Bon zuordnen (Split-Zahlung)
- Benachrichtigungen bei neuen ungematchten Transaktionen
- Kontoauszug-Analyse / Ausgaben-Kategorisierung

## Success Metrics

- [ ] Alle REWE/Lidl/Kaufland-Transaktionen aus `data/konto/Auszug.txt` werden automatisch gematcht
- [ ] Bon-Detailansicht zeigt Badge für gematchte Transaktionen
- [ ] Nicht gematchte Transaktionen erscheinen als virtuelle Bons
- [ ] Gesamtausgaben im Dashboard ändert sich nach Import des Kontoauszugs
- [ ] Re-Matching funktioniert: virtueller Bon verschwindet nach echtem Bon-Import
