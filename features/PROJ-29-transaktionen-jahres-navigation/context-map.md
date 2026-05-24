# PROJ-29: Kontext-Karte

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/transaction-list.tsx` | Erweitern | Einziger Ort für alle PROJ-29-Änderungen (client-seitig) |
| `src/components/product-list.tsx` | Nur lesen | Select-Komponenten-Pattern als Referenz |
| `src/components/ui/select.tsx` | Nur lesen | Shadcn Select Schnittstelle |
| `src/app/api/konto/transactions/route.ts` | Nur lesen | Datenstruktur von bank_transactions (periode-Feld) |

## Kritische Typen & Interfaces

Aus `src/app/api/konto/transactions/route.ts` (Datenmuster):

```typescript
interface Transaction {
  id: number
  buchungsdatum: string          // ISO date
  valutadatum?: string
  typ: string
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  verwendungszweck: string | null
  betrag_cents: number           // Negative = Debit
  periode: string                // Format: "YYYY-MM" ← WICHTIG für Filterung
  kontoauszug_datei: string | null
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
  hidden: number                 // 0 oder 1
  alias: string | null           // Aus LEFT JOIN transaction_aliases
  logo_path: string | null
}
```

## Bestehende State & Logik (transaction-list.tsx)

Aus Zeile 69-81:
```typescript
const [transactions, setTransactions] = useState<Transaction[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const [matching, setMatching] = useState(false)
const [showHidden, setShowHidden] = useState(false)
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
const didInitGroups = useRef(false)
const [searchQuery, setSearchQuery] = useState("")
const [aliasDialog, setAliasDialog] = useState<{ open: boolean; tx: Transaction | null }>({ open: false, tx: null })
```

**Zu ergänzen:**
```typescript
const [selectedYear, setSelectedYear] = useState<string>('all')
const [selectedPeriode, setSelectedPeriode] = useState<string>('all')
```

## Bestehende useMemo-Logik (transaction-list.tsx)

Aus Zeile 83-107:

**`groups` useMemo (Zeile 83-93):**
Gruppiert Transaktionen nach `tx.kontoauszug_datei ?? tx.periode`, sortiert nach `periode` absteigend.

```typescript
const groups = useMemo(() => {
  // Aktuell: groupBy(kontoauszug_datei oder periode)
  // Zu erweitern: Vorgeschalteter .filter() auf periode basierend auf selectedYear + selectedPeriode
}, [transactions, searchQuery, showHidden, selectedYear, selectedPeriode]) // Dependencies ergänzen
```

**`filteredGroups` useMemo (Zeile 95-107):**
Filtert Gruppen basierend auf `searchQuery`. Wenn Search aktiv, Auto-Expand alle Gruppen.

```typescript
const filteredGroups = useMemo(() => {
  // Aktuell: searchQuery-basierte Filterung
  // Keine Änderung nötig — Jahr/Monat-Filterung läuft über groups, nicht filteredGroups
}, [groups, searchQuery])
```

**Auto-Expand-Logik (Zeile 309):**
```typescript
const isExpanded = searchQuery.trim() ? true : expandedGroups.has(group.key)
```

Zu ergänzen:
```typescript
const isExpanded = searchQuery.trim() 
  ? true 
  : (selectedPeriode !== 'all' && group.periode === selectedPeriode) 
  ? true
  : expandedGroups.has(group.key)
```

## Select-Komponenten-Pattern

Aus `product-list.tsx` (Zeile 595-606):

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select value={value} onValueChange={onChange}>
  <SelectTrigger className="h-8 text-sm">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Alle anzeigen</SelectItem>
    <SelectItem value="option1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

**Für PROJ-29:**
- Jahr-Select: Werte = verfügbare Jahre (absteigend) + `"all"`
- Monat-Select: Werte = verfügbare Monate für das Jahr + `"all"`, nur wenn `selectedYear !== 'all'`

## Datenbank-Schema (Referenz)

Aus `src/lib/db.ts` (Zeile 189-208):

```
CREATE TABLE IF NOT EXISTS bank_transactions (
  ...
  periode TEXT NOT NULL,         -- Format: "YYYY-MM"
  ...
)
```

**Keine Änderungen nötig** — `periode` existiert bereits.

## Nicht-lesen-Liste

- `src/components/bon-overview.tsx` — Bon-Listen-Komponente
- `src/app/api/products/` — Produktmanagement
- `src/components/transaction-konto-matching.tsx` — Detailansicht (kein Touch)
- Alle anderen PROJ-1 bis PROJ-27 Feature-Codes

## Tests

### Bestehende Tests

Keine bestehenden Tests für `transaction-list.tsx` gefunden (grep: `transaction-list.test.*`, `test-transaction.*` nicht vorhanden).

### Neue Tests

**E2E-Test (Playwright):**
- `tests/e2e/transaction-year-filter.spec.ts` — NEW
  - Öffne Transaktionsansicht
  - Verifiziere Jahr-Dropdown zeigt verfügbare Jahre
  - Neuestes Jahr ist vorausgewählt
  - Wähle Jahr → Monat-Dropdown wird angezeigt, Liste filtert
  - Wähle Monat → Accordion-Gruppe expandiert automatisch
  - Andere Gruppen sind eingeklappt
  - Textsuche parallel zu Jahr-Filter → Beide aktiv (AND)
  - "Alle Jahre" → Filter zurückgesetzt

**Unit-Test (falls relevant):**
- Wenn Filter-Logik in Hook ausgelagert wird (z. B. `useYearFilter`): `src/hooks/useYearFilter.test.ts`
  - Verfügbare Jahre korrekt abgeleitet
  - Verfügbare Monate für Year korrekt gefiltert
  - Reset-Logik funktioniert

## Notizen

- **Rein client-seitig:** Keine Backend-Änderung nötig. Alle Transaktionen sind bereits geladen.
- **`periode`-Format:** `"YYYY-MM"` — Jahr extrahieren mit `periode.slice(0, 4)`.
- **Monatsnamen auf Deutsch:** `new Date(2026, parseInt(month)-1).toLocaleString('de-DE', { month: 'long' })`
- **Abhängigkeiten bei Jahr-Wechsel:** Wenn `selectedYear` wechselt, `selectedPeriode` automatisch auf `'all'` zurücksetzen.
- **Dependency-Array der useMemo:** Muss `selectedYear` + `selectedPeriode` enthalten, damit Filterung reagiert.
