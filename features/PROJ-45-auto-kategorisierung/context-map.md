# Context Map: PROJ-45 Auto-Kategorisierung von Produkten

**Created:** 2026-05-29
**Architect:** Solution Architect (AI)
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
/produkte (page)
+-- ProductList (src/components/product-list.tsx) — ERWEITERN
|   +-- Tabs: Alle | Aktiv | Ausgeblendet (unverändert)
|   +-- Button "Alle neu kategorisieren (nur Auto)" — NEU (Header der Liste)
|   +-- Tabelle
|       +-- Spalte "Kategorie" — NEU (sortier-/filterbar via PROJ-15 ColumnFilter)
|       |   +-- Visueller Hinweis bei source='auto' (dezenter Sparkles-Icon)
|       +-- Bestehende Spalten (unverändert)
+-- ProductDetailDialog / Detailansicht — ERWEITERN
    +-- Dropdown "Kategorie" — NEU (setzt source='manual')
```

### Data Model

**Neue Tabelle: `product_categories`**

- `alias` TEXT PRIMARY KEY — referenziert `product_aliases.raw_name`
- `category` TEXT NOT NULL — Kategorie-Slug (z. B. `milchprodukte`)
- `source` TEXT NOT NULL CHECK(source IN ('auto','manual'))
- `updated_at` TEXT (ISO-8601)

**Neue Repo-Datei: `src/lib/categorization/rules.json`** (eine Datei für Regeln **und** Kategorien-Metadaten):

```
{
  "categories": [
    { "slug": "milchprodukte", "label": "Milchprodukte", "default_excluded_from_stats": false, "color": "#..." },
    { "slug": "pfand",         "label": "Pfand",         "default_excluded_from_stats": true,  "color": "#..." },
    { "slug": "tabak",         "label": "Tabak",         "default_excluded_from_stats": true,  "color": "#..." },
    { "slug": "drogerie",      "label": "Drogerie",      "default_excluded_from_stats": true,  "color": "#..." },
    { "slug": "sonstiges",     "label": "Sonstiges",     "default_excluded_from_stats": false, "color": "#..." }
  ],
  "rules": [
    { "pattern": "(?i)milch|joghurt|quark|butter|sahne|k(ä|ae)se", "category": "milchprodukte" },
    { "pattern": "(?i)pfand|leergut",                              "category": "pfand" }
  ]
}
```

Standard-Kategorien-Set (mind. spec-konform): Milchprodukte, Brot & Backwaren, Obst, Gemüse, Fleisch & Wurst, Tiefkühl, Getränke, Süßwaren, Drogerie, Pfand, Tabak, Sonstiges.

**Auswertungs-Regel für Statistiken:**

Ein Produkt ist ausgeschlossen, wenn
- Kategorie-Default `default_excluded_from_stats = true` **ODER**
- Produkt-Override `product_aliases.excluded_from_stats = 1`

→ `excluded_from_stats` bleibt als Override-Spalte bestehen, wird bei Migration **nicht** verändert. Default `false`-Kategorien + bestehende `=1`-Overrides ergeben das alte Verhalten 1:1.

### Tech Decisions

- **JSON statt YAML/TS:** Keine zusätzliche Dependency, native Parser, einfach zu reviewen. Patterns werden zur Laufzeit zu `RegExp` kompiliert (cached pro Prozess).
- **Eine Datei** (`rules.json`) für Kategorien-Metadaten **und** Patterns — erspart das Synchronhalten zweier Dateien.
- **Kategorisierung läuft im Backend** (API-Routes/Lib), nicht im Browser — Patterns konsistent serverseitig.
- **Re-Run-Button** sitzt in der Produktliste; ruft POST-Endpoint, der nur `source='auto'`-Einträge anfasst.
- **Migration:** Idempotenter Check in `initSchema()` (`if count(product_categories)=0 && count(product_aliases)>0 → backfill`).
- **Override-Strategie:** Bestehende `excluded_from_stats=1` werden 1:1 beibehalten — keine Datenmigration auf Kategorien-Defaults.

### Dependencies (packages to install)

Keine. Native `RegExp` + native JSON.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** die unten gelisteten Dateien.
> Bitte nicht eigenständig den Code scannen.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | Neue Tabelle `product_categories` in `initSchema()`; Backfill-Block |
| `src/lib/categorization/rules.json` | Neu erstellen | Versioniertes Regelwerk + Kategorien-Metadaten |
| `src/lib/categorization/engine.ts` | Neu erstellen | `categorize(name): string`; `getCategoryMeta(slug)`; `getAllCategories()`; lädt + cached `rules.json` |
| `src/lib/categorization/migrate.ts` | Neu erstellen | Einmal-Backfill aller Aliase → `product_categories` (source='auto') |
| `src/app/api/import/route.ts` | Erweitern | Nach Alias-Anlage `categorize()` aufrufen, in `product_categories` upserten falls nicht vorhanden (source='auto') |
| `src/app/api/avis/import/route.ts` | Erweitern | Gleicher Hook wie oben |
| `src/app/api/paperless/sync/route.ts` | Erweitern | Gleicher Hook wie oben |
| `src/app/api/produkte/route.ts` | Erweitern | Join `product_categories` → liefert `category` + `category_source`; neuer PROJ-15-Spaltenfilter `category` (select) |
| `src/app/api/produkte/[name]/category/route.ts` | Neu erstellen | `PUT { category }` setzt manuellen Override (source='manual'); `DELETE` → zurück auf auto |
| `src/app/api/produkte/recategorize/route.ts` | Neu erstellen | `POST` → läuft `categorize()` über alle `source='auto'`-Einträge; gibt Counts zurück |
| `src/app/api/statistiken/inflation/route.ts` | Erweitern | WHERE-Klausel erweitern um Kategorie-Default |
| `src/app/api/statistiken/einkaufskorb-vergleich/vorjahr/route.ts` | Erweitern | Gleiche WHERE-Anpassung |
| `src/app/api/statistiken/einkaufskorb-vergleich/voreinkauf/route.ts` | Erweitern | Gleiche WHERE-Anpassung |
| `src/app/api/statistiken/top-produkte/route.ts` | Erweitern | Gleiche WHERE-Anpassung |
| `src/app/api/statistiken/monatlich/route.ts` | Erweitern | Gleiche WHERE-Anpassung |
| `src/components/product-list.tsx` | Erweitern | Spalte "Kategorie" mit Auto/Manual-Indikator; Re-Run-Button im Header; Dropdown in Detailansicht |
| `src/app/produkte/page.tsx` | Nur lesen | Page-Wrapper, kein Eingriff |
| `src/components/ui/select.tsx` | Nur lesen | shadcn Select für Dropdown |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// src/lib/categorization/engine.ts
type CategoryMeta = {
  slug: string;                          // 'milchprodukte'
  label: string;                         // 'Milchprodukte'
  default_excluded_from_stats: boolean;
  color?: string;
};

type CategoryRule = {
  pattern: string;                       // Regex-Quelle; (?i) für case-insensitive
  category: string;                      // FK auf CategoryMeta.slug
};

type RulesFile = {
  categories: CategoryMeta[];
  rules: CategoryRule[];                 // Reihenfolge = Priorität
};

// src/app/api/produkte/route.ts — Response-Erweiterung
type ProductRow = {
  raw_name: string;
  alias: string | null;
  excluded_from_stats: 0 | 1;
  seasonal: 0 | 1;
  category: string;                      // NEU — slug, niemals leer ('sonstiges' = Fallback)
  category_source: 'auto' | 'manual';    // NEU
  // ... bestehende Felder unverändert
};
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/lib/parser/*` — Parser-Output (`rawName`) wird unverändert konsumiert
- `src/components/transaction-list.tsx`, `src/components/bon-*.tsx` — kein Bezug
- `src/app/api/avis/*` (außer `import/route.ts`) — Alias-Mechanik bleibt
- `src/components/ui/` — shadcn, keine Änderung

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `src/app/api/produkte/produkte-exclude.test.ts` | Unit/Integration | Override-Spalte bleibt — Tests müssen weiter grün sein; ggf. erweitern für Kombination mit Kategorie-Default |
| `tests/PROJ-8-produkt-statistik-ausblendung.spec.ts` | E2E | Statistik-Ausschluss-Logik wird erweitert — Regression prüfen, dass alte Excludes weiter wirken |
| `tests/PROJ-13-ausgeblendete-artikel-tab.spec.ts` | E2E | Excluded-Tab bleibt — Regression |
| `src/app/api/statistiken/einkaufskorb-vergleich/vorjahr.test.ts` | Unit | WHERE-Klausel ändert sich — Tests anpassen |

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `src/lib/categorization/engine.test.ts` | Unit | `categorize()` für Sample-Inputs pro Standard-Kategorie; Fallback auf `sonstiges`; Reihenfolge = Priorität; case-insensitive + Unicode/Umlaut |
| `src/lib/categorization/migrate.test.ts` | Unit | Backfill läuft idempotent; setzt nur `source='auto'`; bestehende manuelle Einträge unangetastet |
| `src/app/api/produkte/[name]/category/route.test.ts` | Unit | PUT setzt `source='manual'`; DELETE setzt auf auto zurück |
| `src/app/api/produkte/recategorize/route.test.ts` | Unit | Re-Run berührt nur `source='auto'`; gibt Counts zurück |
| `tests/PROJ-45-auto-kategorisierung.spec.ts` | E2E | Ein `test()` pro Acceptance Criterion: Import kategorisiert · Override überlebt Reimport · Pfand default ausgeschlossen · Re-Run-Button · Kategorie-Spalte sicht-/filterbar |
