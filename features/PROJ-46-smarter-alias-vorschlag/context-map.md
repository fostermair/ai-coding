# Context Map: PROJ-46 Smarter Alias-Vorschlag beim Import

**Created:** 2026-05-29  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
ImportZone (erweitert)
  ├── DropZone (unverändert)
  ├── QueueItem — success (unverändert)
  └── AliasSuggestionDialog (NEU — öffnet sich nach erfolgreichem Import mit Vorschlägen)
        ├── Dialog Header: "Alias-Vorschläge (X neue Artikel)"
        ├── Beschreibungstext
        └── SuggestionTable (inline, kein eigenes File)
              ├── Row [confidence ≥ 90 %]: grün hervorgehoben
              │     raw_name | Vorschlag [Badge: 93 %] | [Übernehmen] [Anderer Alias] [Überspringen]
              ├── Row [confidence 50–89 %]: normal
              │     raw_name | Vorschlag [Badge: 72 %] | ...
              └── Row [confidence < 50 %]: gedimmt + Badge "niedrige Konfidenz"
                    raw_name | Vorschlag [Badge: 34 %] | ...
```

### Data Model

```
product_aliases (bestehende Tabelle — um eine Spalte erweitert):
- raw_name: TEXT PRIMARY KEY  (eBon-Rohname)
- alias: TEXT                 (lesbarer Produktname)
- source: TEXT NULL           (NEU: 'manual' | 'suggested' | 'avis' | NULL)
- excluded_from_stats: INTEGER
- seasonal: INTEGER
- updated_at: TEXT

Gespeichert in: SQLite (lokal, src/lib/db.ts)
Migration: ALTER TABLE product_aliases ADD COLUMN source TEXT  (falls nicht vorhanden)
Bestehende Zeilen: source bleibt NULL (= historisch manuell gesetzt)
```

### Tech Decisions

**Wiederverwendung von `computeMatchScore()`:** Die bestehende Funktion in `avis-matching.ts` vergleicht zwei Produktnamen mithilfe von Levenshtein + Token-Set-Similarity. Für PROJ-46 wird sie symmetrisch eingesetzt — neuer `raw_name` vs. jeder bestehende `raw_name` in `product_aliases`. Keine neue Library nötig.

**Berechnung server-seitig (Node.js):** Die gesamte Vorschlagsberechnung läuft im Import-API-Route, nicht im Browser. Alle Aliase werden einmalig pro Request geladen — nicht pro Item. Das verhindert N+1-Queries und erfüllt das Performance-Ziel (< 2 s bei 5000 Aliasen).

**Keine Auto-Speicherung:** Vorschläge werden nur in der API-Response mitgeliefert. Der Dialog zeigt sie an, setzt aber nichts ohne User-Klick. Confirm-Step ist ein Pflicht-Designprinzip.

**Source-Tracking via bestehende Alias-Route:** Statt einer neuen Endpoint-Route wird `PUT /api/produkte/[name]/alias` um ein optionales `source`-Feld erweitert. Das hält die Codebasis schlank.

**Konfidenz-Schwellwerte:**
- ≥ 90 % → grün hervorgehoben (visuell "vorausgewählt", nicht auto-gespeichert)
- 50–89 % → neutraler Vorschlag
- < 50 % → gedimmt + Badge "niedrige Konfidenz"

### Dependencies (packages to install)

Keine neuen Pakete erforderlich — alle benötigten Libraries sind bereits im Projekt.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) lesen **NUR** die unten gelisteten Dateien.
> Kein eigenständiges Codebase-Scanning.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | DB-Migration: `source TEXT` Spalte zu `product_aliases` hinzufügen |
| `src/lib/avis-matching.ts` | Erweitern | Neue Funktion `suggestAlias()` als dünner Wrapper um `computeMatchScore()` |
| `src/app/api/import/route.ts` | Erweitern | Response um `alias_suggestions[]` erweitern; Vorschlagsberechnung nach Insert |
| `src/app/api/produkte/[name]/alias/route.ts` | Erweitern | PUT-Handler: optionales `source`-Feld aus Body lesen & in DB schreiben |
| `src/components/import-zone.tsx` | Erweitern | State + Dialog-Trigger nach erfolgreichem eBon-Import mit Vorschlägen |
| `src/components/alias-suggestion-dialog.tsx` | Neu erstellen | Neuer Dialog mit Vorschlags-Tabelle (Confirm/Reject/Manual) |
| `src/app/api/avis/suggestions/route.ts` | Nur lesen | Referenz: wie computeMatchScore() serverseitig genutzt wird |
| `src/components/avis-confirmation-dialog.tsx` | Nur lesen | Referenz-Komponente für Dialog-Struktur und UX-Pattern |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// ── In: src/lib/avis-matching.ts (neu hinzufügen) ──────────────────────────

export function suggestAlias(
  rawName: string,
  existingAliases: Array<{ raw_name: string; alias: string }>
): { suggestion: string | null; confidence: number }
// Reuses computeMatchScore(existingAlias.raw_name, rawName) for each entry
// Returns top result; confidence = 0 and suggestion = null if no candidates

// ── In: src/app/api/import/route.ts (response shape, erweitert) ────────────

interface AliasSuggestion {
  raw_name: string
  suggestion: string | null  // alias value of the best-matching existing alias
  confidence: number         // 0–100
}

interface ImportResponse {
  id: number
  date: string
  store: string
  items: number
  total: string
  alias_suggestions: AliasSuggestion[]  // NEU: leer [] wenn keine ungemappten raw_names
}

// ── In: src/components/import-zone.tsx (neue State-Felder) ─────────────────

interface QueueItem {
  id: string
  filename: string
  status: ImportStatus
  result?: ImportResult
  error?: string
  aliasSuggestions?: AliasSuggestion[]  // NEU
}

// ── In: src/components/alias-suggestion-dialog.tsx (neue Komponente) ────────

interface AliasSuggestionDialogProps {
  open: boolean
  suggestions: AliasSuggestion[]
  onConfirm: (rawName: string, alias: string, source: 'suggested' | 'manual') => Promise<void>
  onSkip: (rawName: string) => void
  onClose: () => void
}

// Interne State-Zeile per Suggestion:
interface SuggestionRowState {
  rawName: string
  suggestion: string | null
  confidence: number
  status: 'pending' | 'accepted' | 'skipped'
  customAlias?: string
  showManualInput: boolean
}

// ── Confidence-Schwellwerte (Konstanten in der Dialog-Komponente) ───────────
// HIGH_CONFIDENCE = 90   → grün hervorgehoben
// LOW_CONFIDENCE  = 50   → unter 50 % = "niedrige Konfidenz" Badge

// ── In: PUT /api/produkte/[name]/alias — erweiterter Request Body ───────────
interface AliasUpdateBody {
  alias: string
  source?: 'manual' | 'suggested' | 'avis'  // NEU: optional; default → 'manual' bei manueller Eingabe
}
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/avis/` (außer `suggestions/route.ts`) — AVIS-spezifische Matching-Logik, unberührt
- `src/app/api/bons/` — Bon-Detailansicht, unberührt
- `src/app/api/konto/` — Kontoauszug-Features, unberührt
- `src/app/api/bestellung/` — Bestellungs-Features, unberührt
- `src/app/api/statistiken/` — Statistiken, unberührt
- `src/app/api/export/` — Export-Features, unberührt
- `src/components/ui/` — shadcn-Komponenten, keine Änderungen
- `src/components/bon-detail.tsx` — unberührt
- `src/components/bon-list.tsx` — unberührt
- `src/components/product-list.tsx` — unberührt
- `src/components/transaction-list.tsx` — unberührt

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `src/lib/avis-matching.test.ts` | Unit | `avis-matching.ts` wird erweitert — neue `suggestAlias()`-Funktion testen |
| `src/app/api/produkte/aliases/bulk/route.test.ts` | Unit | Referenz: wie Alias-Tests strukturiert sind (Lesen als Muster) |

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `src/lib/avis-matching.test.ts` | Unit (Erweiterung) | `suggestAlias()`: leere DB → confidence 0, ähnlicher raw_name → Top-Vorschlag, identischer raw_name → confidence 100, mehrere gleich gute Kandidaten → deterministisch |
| `tests/PROJ-46-alias-suggestion.spec.ts` | E2E | AC1: Import mit ungemapptem raw_name zeigt Dialog; AC2: "Übernehmen" speichert mit source='suggested'; AC3: "Anderer Alias" speichert mit source='manual'; AC4: "Überspringen" schließt Zeile, kein Alias gesetzt; AC5: Bei confidence < 50 % Badge "niedrige Konfidenz" sichtbar |
