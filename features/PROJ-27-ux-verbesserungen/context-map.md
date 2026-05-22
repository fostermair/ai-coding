# PROJ-27 – Context Map: UX-Verbesserungen Bon- & Transaktionsübersicht

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/bon-list.tsx` | Erweitern | Suchfunktion + Datums-Filter entfernen + Accordion |
| `src/components/transaction-list.tsx` | Erweitern | Accordion + Chain-Badge via Alias |
| `src/app/api/bons/route.ts` | Nur lesen | `from`/`to` Query-Param prüfen – ob er nach Entfernung der UI noch gebraucht wird |

---

## Kritische Typen & Interfaces

### BonSummary (bon-list.tsx)
```ts
interface BonSummary {
  id: number
  receipt_date: string           // "YYYY-MM-DD" → für Suche als String
  receipt_time: string | null
  store_name: string | null      // Primär-Suchfeld
  receipt_nr: string | null
  market_nr: string | null
  item_count: number
  total_amount_cents: number
  payment_method: string | null
  store_chain: string | null
  avis_status: string | null
  is_virtual: number
  bank_alias: string | null
  bank_logo_path: string | null
  market_alias: string | null
  market_logo_path: string | null
  has_bank_match: number
  bank_match_source: string | null
}
```

### Transaction (transaction-list.tsx)
```ts
interface Transaction {
  id: number
  buchungsdatum: string
  valutadatum: string | null
  typ: string | null
  beschreibung: string | null
  haendler_name: string | null
  empfaenger_name: string | null
  betrag_cents: number
  periode: string
  kontoauszug_datei: string | null
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: string | null
  hidden: number
  alias: string | null       // ← wird für detectChain hinzugefügt
  logo_path: string | null
}
```

---

## Implementierungsdetails je Änderung

### Änderung 1 & 2: Bon-Übersicht – Suche + Filter entfernen

**Zu entfernen aus `bon-list.tsx`:**
- State: `dateFrom`, `dateTo`
- URL-Aufbau mit `?from=&to=` in `fetchBons`
- Filter-UI: `<div>` mit den zwei Date-Inputs + Reset-Button
- `hasFilters` Variable und abhängige Logik

**Hinzuzufügen:**
- State: `const [searchQuery, setSearchQuery] = useState('')`
- `filteredGroups` useMemo (nach `groups`): filtert Gruppen, wenn `searchQuery` nicht leer; matched auf `bon.store_name?.toLowerCase()` und `bon.receipt_date`; leere Gruppen werden herausgefiltert
- `<Input>` Suchfeld mit Placeholder "Markt oder Datum suchen..." (analog zu transaction-list.tsx)
- `isExpanded` Logik: `searchQuery.trim() ? true : expandedYears.has(group.year)` (force-expand bei aktiver Suche)
- Empty state für `filteredGroups.length === 0 && searchQuery`: "Keine Ergebnisse für '...'"-Hinweis

### Änderung 3: Accordion-Verhalten (beide Dateien)

**bon-list.tsx – `toggleYear` ändern:**
```
// Alt: toggle (öffnet/schließt unabhängig)
const next = new Set(prev); if (next.has(year)) next.delete(year) else next.add(year)

// Neu: Standard-Akkordeon
if (prev.has(year)) return new Set()      // schließen wenn schon offen
return new Set([year])                    // sonst nur dieses öffnen
```

**transaction-list.tsx – `toggleGroup` ändern:**
Identische Logik, keyed by `group.key` statt `year`.

### Änderung 4: Chain-Badge via Alias (transaction-list.tsx)

Logo-Zell-Render – aktuell:
```
detectChain(tx.haendler_name ?? tx.empfaenger_name ?? tx.beschreibung)
```

Neu:
```
detectChain(tx.alias ?? tx.haendler_name ?? tx.empfaenger_name ?? tx.beschreibung)
```

---

## Nicht-lesen-Liste
- `src/app/api/` (alle außer `bons/route.ts`) — keine API-Änderungen nötig
- `src/components/ui/` — shadcn-Komponenten, keine Änderungen
- `src/lib/chain.ts` — `detectChain` selbst wird nicht verändert, nur der Aufruf

---

## Tests

### Bestehende Tests (prüfen)
| Datei | Aktion | Grund |
|---|---|---|
| `src/app/api/konto/transactions/[id]/hide/route.test.ts` | Regression prüfen | Berührt transaction-route, kein direkter Bezug |
| `src/app/api/bons/bons-avis-status.test.ts` | Regression prüfen | Bon-API wird vereinfacht (kein from/to mehr von UI) |

### Neue Tests
| Datei | Typ | Was testen |
|---|---|---|
| Kein neuer Unit-Test nötig | — | Reine UI-Logik in bestehenden Komponenten; E2E-Tests decken das ab |

---

## API-Hinweis
`src/app/api/bons/route.ts` unterstützt `?from=&to=` Query-Params. Diese können im Code bleiben – sie werden nach Entfernung der UI einfach nicht mehr übergeben. Kein Breaking Change, kein API-Update nötig.
