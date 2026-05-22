# PROJ-27 – UX-Verbesserungen Bon- & Transaktionsübersicht

**Status:** In Progress  
**Created:** 2026-05-22  
**Dependencies:** PROJ-2 (Bon-Übersicht), PROJ-25/26 (Transaktionsübersicht)

## Implementation Notes

**Frontend completed (2026-05-22):**
- Added search functionality to bon-list.tsx (filters by store name and date)
- Removed date range filter UI from bon-list.tsx
- Implemented accordion behavior in both bon-list and transaction-list (only one year/period expanded at a time)
- Updated chain-badge detection to prioritize `alias` field over `haendler_name`
- All AC criteria from US-1 through US-4 implemented
- Build verification passed with no TypeScript errors

---

## Zusammenfassung

Vier kleine UX-Verbesserungen in der Bon- und Transaktionsübersicht:
1. Suchfunktion in der Bon-Übersicht (analog zur Transaktionsübersicht)
2. Datums-Filterleiste in der Bon-Übersicht entfernen
3. Accordion-Verhalten für Jahres-/Periodengruppen in beiden Ansichten
4. Chain-Badge in der Transaktionsübersicht auch über Alias erkennen

---

## User Stories

### US-1: Suchfunktion in der Bon-Übersicht

**Als** Nutzer  
**möchte ich** in der Bon-Übersicht nach Supermärkten oder Datum suchen können,  
**damit** ich einen bestimmten Einkauf schnell finde, ohne durch alle Jahresgruppen scrollen zu müssen.

**Acceptance Criteria:**
- AC1.1: Ein Suchfeld erscheint am oberen Rand der Bon-Übersicht (analog zur Transaktionsübersicht).
- AC1.2: Die Suche filtert Bons client-seitig in Echtzeit nach Store-Name und Einkaufsdatum (als lesbarer String, z.B. "12.05.2024").
- AC1.3: Wenn eine Suchanfrage aktiv ist, werden alle Jahresgruppen automatisch aufgeklappt, damit alle Treffer sichtbar sind.
- AC1.4: Ist die Suche leer, wird das Standardverhalten (nur neuestes Jahr offen) wiederhergestellt.
- AC1.5: Findet die Suche keine Ergebnisse, wird ein "Keine Ergebnisse"-Hinweis angezeigt.

---

### US-2: Datums-Filter entfernen

**Als** Nutzer  
**möchte ich**, dass die "Von/Bis"-Filterleiste in der Bon-Übersicht entfernt wird,  
**damit** die Oberfläche übersichtlicher ist (die Suchfunktion aus US-1 ersetzt diesen Anwendungsfall).

**Acceptance Criteria:**
- AC2.1: Die "Von"- und "Bis"-Datumseingabefelder sind nicht mehr sichtbar.
- AC2.2: Der "Filter zurücksetzen"-Button ist entfernt.
- AC2.3: Der API-Aufruf enthält keine `?from=&to=`-Parameter mehr.

---

### US-3: Accordion-Verhalten für Jahresgruppen

**Als** Nutzer  
**möchte ich**, dass beim Aufklappen einer Jahresgruppe die bisher geöffnete Gruppe automatisch zuklappt,  
**damit** ich nicht ständig manuell zurückgehen muss und die Übersicht kompakt bleibt.

**Acceptance Criteria (Bon-Übersicht & Transaktionsübersicht):**
- AC3.1: Beim Klick auf eine zugeklappte Gruppe öffnet diese sich und alle anderen Gruppen klappen zu.
- AC3.2: Beim Klick auf eine bereits geöffnete Gruppe klappt sie zu (es bleibt kein Jahr permanent offen).
- AC3.3: Beim ersten Laden ist automatisch das neueste Jahr offen (bestehendes Verhalten bleibt erhalten).
- AC3.4: Bei aktiver Suche (TransactionList & BonList) sind weiterhin alle Gruppen force-expanded.

---

### US-4: Chain-Badge via Alias in der Transaktionsübersicht

**Als** Nutzer  
**möchte ich**, dass in der Transaktionsübersicht das passende Ketten-Logo (z.B. Edeka) auch dann angezeigt wird, wenn der Kettenname nur im Alias steht,  
**damit** Transaktionen mit manuellem Alias trotzdem korrekt als Kette erkennbar sind.

**Acceptance Criteria:**
- AC4.1: Wenn eine Transaktion kein `logo_path` hat, wird `detectChain()` auf `alias ?? haendler_name ?? empfaenger_name ?? beschreibung` aufgerufen (Alias hat höchste Priorität).
- AC4.2: Eine Transaktion mit Alias "Edeka Markt" zeigt das Edeka-Badge, auch wenn `haendler_name` keinen Ketten-Begriff enthält.
- AC4.3: Transaktionen mit gesetztem `logo_path` sind nicht betroffen – das custom Logo hat weiterhin Vorrang.

---

## Edge Cases

- Suche in Bon-Übersicht: Sonderzeichen im Store-Namen werden korrekt verglichen (lowercase-Vergleich).
- Accordion bei Suche: Accordion-State wird beim Leeren des Suchfelds zurückgesetzt (nur das neueste Jahr offen).
- Chain-Badge: Falls `alias` gesetzt ist aber keinen Ketten-Begriff enthält, fällt `detectChain()` auf `haendler_name` etc. zurück (da `null`-Return von `detectChain` das normale Verhalten ist).

---

## Out of Scope

- Suche über Einzelartikel innerhalb eines Bons
- Persistierung des Suchzustands über Seitenwechsel
- Entfernung des Datums-Filter-API-Endpunkts selbst (nur UI)
