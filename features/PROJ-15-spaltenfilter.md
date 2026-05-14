# PROJ-15: Spaltenweise Filterung in Produktliste

**Status:** Approved  
**Created:** 2026-05-14  
**Updated:** 2026-05-14

## Übersicht

Nutzer können pro Spalte in der Produkttabelle eigene Filter setzen – z. B. nur Produkte mit Preistrend > 5 %, Preis-Bereich, Kaufhäufigkeit, oder nur saisonale Artikel. Alle Filter werden client-seitig angewendet.

## Anforderungen

### Filterbare Spalten & Filtertypen

| Spalte | Filtertyp | Beispiel |
|--------|-----------|----------|
| Produkt | Text (Substring) | "Milch" |
| Alias | Text (Substring) | "Bio" |
| Käufe | Zahlenbereich | Min: 2, Max: 10 |
| Letzter Preis | Zahlenbereich (€) | Min: 1.50, Max: 5.00 |
| Preistrend | Zahlenbereich (%) | Min: 5, Max: 50 |
| Ø Inflation p.a. | Zahlenbereich (%) | Min: 0, Max: 20 |
| Letzter Kauf | Datumsbereich | Von: 2026-01-01, Bis: 2026-05-14 |
| Saison | Auswahl-Dropdown | "Günstig" / "Normal" / "Teuer" / "Nur saisonal" |

### Filter-UI

- **Filter-Icon (Trichter)** neben Spaltennamen in der Kopfzeile
- Icon zeigt Farbe an: Blau wenn Filter aktiv, Grau wenn inaktiv
- Klick öffnet ein **Popover** mit Filtereingaben
- Jedes Popover hat einen "Zurücksetzen"-Link
- Ein **"Alle Filter zurücksetzen"-Button** erscheint in der Such-Bar, wenn ≥1 Filter aktiv ist

### Verhalten

- Filter sind unabhängig von bestehender Volltextsuche (additive Filterung)
- Filter arbeiten client-seitig auf bereits geladenem `data.products` Array
- Sortierung bleibt unabhängig und wirkt auf gefilterte Produkte
- Filterstatus wird NICHT in URL oder localStorage gespeichert (ephemer)
- Beide Tabs ("Produkte" & "Ausgeblendet") teilen denselben `columnFilters`-State

### Komponenten

- **TextFilterPopover**: Text-Eingabe für Produkt-/Alias-Filter
- **RangeFilterPopover**: Min/Max für Zahlenfilter (Käufe, Preis, Trend, Inflation)
- **DateRangeFilterPopover**: Von/Bis für Datumsbereich
- **SeasonFilterPopover**: Dropdown-Select für Saison-Filter
- **ProductTableHeader**: Erweitert mit Filter-Icons & Popovers für alle filterbaren Spalten

## Implementierung

### Typen
```typescript
type ColumnFilterText   = { type: "text"; value: string }
type ColumnFilterRange  = { type: "range"; min: string; max: string }
type ColumnFilterSelect = { type: "select"; value: string }
type ColumnFilter = ColumnFilterText | ColumnFilterRange | ColumnFilterSelect
type ColumnFilterKey = "name" | "alias" | "frequency" | "last_price" | "price_trend" | "inflation_cagr" | "last_purchase" | "season"
type ColumnFilters = Partial<Record<ColumnFilterKey, ColumnFilter>>
```

### State
```typescript
const [columnFilters, setColumnFilters] = useState<ColumnFilters>({})
const activeFilterCount = useMemo(() => { /* count non-empty filters */ }, [columnFilters])
```

### Filter-Logik (useMemo)
Neue `filteredProducts` useMemo, die `allProducts` durchläuft und `columnFilters` anwendet:
- Text: `.toLowerCase().includes()`
- Zahlen: `>= min && <= max` (null-safe)
- Datum: `>= von && <= bis`
- Select: Direkt-Vergleich gegen Enums ("günstig", "normal", "teuer", "seasonal")

### Rendering
- `ProductTableHeader` erhält Props: `columnFilters` + `onFilterChange`
- Jede filterbare Spalte bekommt ein Filter-Icon (Popover)
- Popover-Inhalte variieren je nach Filtertyp
- Active-Filter-Count-Badge im "Reset"-Button

## Technische Details

### Datei-Änderungen
- `src/components/product-list.tsx` - alle Änderungen
- Imports: `Popover`, `PopoverContent`, `PopoverTrigger`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Filter`, `XCircle` Icons

### Keine API-Änderungen
Filter sind rein client-seitig. Die bestehende `GET /api/produkte?q=...` API wird unverändert verwendet.

## Test-Plan

1. **Textfilter testen**
   - "Produkt" filtern → nur Treffer anzeigen
   - "Alias" filtern → nur Alias-Treffer anzeigen

2. **Zahlenbereich-Filter testen**
   - Käufe Min=2 → nur ≥2
   - Letzter Preis Max=5€ → nur ≤5€
   - Preistrend Min=5% → nur ≥5%

3. **Datumsbereich testen**
   - Letzter Kauf: Von=2026-01-01 → nur ab diesem Datum

4. **Saison-Select testen**
   - "Günstig" → nur current_month_season="günstig"
   - "Nur saisonal" → nur seasonal=true

5. **Kombiniert**
   - 2+ Filter setzen → alle sollten additive wirken
   - "Filter zurücksetzen" Button → alle Filter löschen

6. **Bestehende Funktionen nicht brechen**
   - Sortierung weiterhin funktionieren
   - Globale Suche weiterhin funktionieren
   - Alias-Bearbeitung weiterhin funktionieren
   - Exclude/Seasonal-Toggle weiterhin funktionieren
   - Preis-Chart weiterhin funktionieren

## Definition of Done

- [x] Spaltenweise Filter in Tabellenkopfzeile sichtbar
- [x] Alle 8 Spalten sind filterbar
- [x] Filter-Icons wechseln Farbe bei aktivem Filter
- [x] Popover-UIs funktionieren für alle Filtertypen
- [x] Gefilterte Produkte werden korrekt angezeigt
- [x] "Alle Filter zurücksetzen"-Button funktioniert
- [x] Keine bestehenden Features beschädigt

## Notizen

- Filter sind ephemer (nicht persistent)
- Ein Popover pro Filtertyp reduziert Komplexität
- shadcn Popover & Select für Konsistenz mit bestehendem Design
- Filter gelten für beide Tabs (Produkte & Ausgeblendet)
