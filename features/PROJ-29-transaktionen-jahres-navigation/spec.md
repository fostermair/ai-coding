# PROJ-29: Jahres-Dropdown & Kontoauszug-Navigation in Transaktionsansicht

## Status: Planned
## Created: 2026-05-24

## Dependencies
- PROJ-24 (Kontoauszug-Import) — `bank_transactions.periode` (YYYY-MM) und `bank_statement_log` bereits vorhanden
- PROJ-25 (Bon-Kontoauszug Abgleich) — Transaktionsansicht bereits implementiert

---

## Problem / Motivation

Die Transaktionsansicht zeigt alle importierten Kontobewegungen in einer einzigen langen, nach Kontoauszügen gruppierten Liste. Bei vielen Monaten wird die Navigation unübersichtlich. Nutzer möchten direkt zu einem bestimmten Monat eines Jahres springen, ohne durch alle anderen Accordion-Gruppen zu scrollen.

---

## User Stories

### US-1: Jahres-Dropdown für schnelle Navigation
**Als** Nutzer der Transaktionsansicht  
**möchte ich** ein Dropdown zur Jahresauswahl haben  
**damit** ich schnell zu Transaktionen eines bestimmten Jahres navigieren kann.

**Akzeptanzkriterien:**
- [ ] Oberhalb der Transaktionsliste erscheint ein Dropdown "Jahr auswählen"
- [ ] Das Dropdown listet alle Jahre, für die Transaktionen vorhanden sind (absteigend, neuestes zuerst)
- [ ] Standardmäßig ist das aktuellste Jahr vorausgewählt
- [ ] Eine Option "Alle Jahre" ermöglicht die ungefilterte Ansicht
- [ ] Die Liste aktualisiert sich dynamisch, wenn neue Kontoauszüge importiert werden

### US-2: Monat-Auswahl innerhalb eines Jahres
**Als** Nutzer  
**möchte ich** nach Auswahl eines Jahres einen Monat auswählen können  
**damit** ich direkt zur gewünschten Accordion-Gruppe scrolle oder nur diesen Monat angezeigt bekomme.

**Akzeptanzkriterien:**
- [ ] Nach Auswahl eines Jahres erscheint ein zweites Dropdown "Monat auswählen"
- [ ] Das Monat-Dropdown listet nur Monate, für die in diesem Jahr Transaktionen vorhanden sind
- [ ] Standardmäßig ist "Alle Monate" vorausgewählt (zeigt alle Monate des Jahres)
- [ ] Bei Auswahl eines Monats wird die Liste auf diesen Monat gefiltert
- [ ] Die entsprechende Accordion-Gruppe wird automatisch aufgeklappt
- [ ] Monatsnamen werden auf Deutsch angezeigt (z. B. "Mai 2026")

### US-3: Filterung kombiniert mit Suche
**Als** Nutzer  
**möchte ich** Jahr/Monat-Filter und Textsuchfeld gleichzeitig nutzen  
**damit** ich z. B. alle REWE-Transaktionen im März 2025 finden kann.

**Akzeptanzkriterien:**
- [ ] Jahr/Monat-Filter und Textsuche sind kombinierbar (AND-Logik)
- [ ] Das Textfeld bleibt sichtbar und funktionsfähig, wenn ein Jahr/Monat gewählt ist
- [ ] "Filter zurücksetzen" oder Auswahl von "Alle Jahre" setzt beide Filter zurück

---

## Scope / Out of Scope

**In Scope:**
- Jahres-Dropdown (Select-Komponente, shadcn/ui Select) in `transaction-list.tsx`
- Monat-Dropdown (abhängig vom gewählten Jahr)
- Client-seitige Filterlogik auf bereits geladene Transaktionen
- Automatisches Aufklappen der passenden Accordion-Gruppe bei Monatswahl

**Out of Scope:**
- Server-seitige Filterung (alle Daten sind bereits geladen, client-seitig ausreichend)
- Anzeige des Kontoauszug-PDFs (separates Feature, falls gewünscht)
- Mehrfachauswahl von Jahren oder Monaten
- Verknüpfung mit der Bon-Übersicht

---

## Edge Cases

- Nur ein Jahr vorhanden → Jahres-Dropdown zeigt nur dieses Jahr; Monat-Dropdown immer sichtbar
- Monat hat 0 Transaktionen (nach hidden-Filter) → Monat trotzdem im Dropdown anzeigen, Leermeldung in der Liste
- Textsuche aktiv + Jahres-Filter → beide Bedingungen gelten (AND); alle Accordion-Gruppen des gewählten Jahres geöffnet
- Neuer Import während geöffneter Ansicht → Dropdowns aktualisieren sich beim nächsten Laden der Transaktionen

---

## UI-Verhalten

```
[ Jahr: 2026 ▼ ]  [ Monat: Alle ▼ ]  [ 🔍 Suche... ]

─────────────────────────────────────────────────────
▶ Mai 2026  ·  Konto_202605.pdf  ·  3 Buchungen  ·  -142,80 €
▶ April 2026  ·  Konto_202604.pdf  ·  5 Buchungen  ·  -89,50 €
...
```

Bei Monat "Mai 2026" ausgewählt:
```
[ Jahr: 2026 ▼ ]  [ Monat: Mai ▼ ]  [ 🔍 Suche... ]

─────────────────────────────────────────────────────
▼ Mai 2026  ·  Konto_202605.pdf  ·  3 Buchungen  ·  -142,80 €
  [Transaktionen ausgeklappt]
```

---

## Komponenten-Hinweise

- Reuse: `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` aus `src/components/ui/select.tsx` (gleiche Komponenten wie in `product-list.tsx`)
- Filter-State: `selectedYear: string | 'all'` + `selectedPeriode: string | 'all'` als `useState` in `transaction-list.tsx`
- Grouping-Logik: bestehende `groups` useMemo in `transaction-list.tsx` mit vorgeschaltetem `.filter()` auf `periode` erweitern
- Verfügbare Jahre/Monate aus `transactions` ableiten (kein zusätzlicher API-Call)
