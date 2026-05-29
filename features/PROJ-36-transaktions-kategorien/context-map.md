# PROJ-36: Context Map — Transaktions-Kategorien

**Status:** Architected  
**Last Updated:** 2026-05-28

---

## Übersicht

Regelbasierte Kategorie-Zuweisung für Transaktionen via Substring-Matching der `beschreibung`. Die Transaktionsansicht bekommt zwei Reiter: „Transaktionen" (bestehend, erweitert) und „Kategorien" (neu). Matching läuft im App-Layer (nicht SQL), um die "längster Treffer gewinnt"-Logik einfach abzubilden.

---

## Komponentenstruktur

```
src/app/transaktionen/page.tsx
  └── TransactionList                     (erweitern: Tabs hinzufügen)
       ├── [Tab 1: Transaktionen]          (bestehend — Kategorie-Badge ergänzen)
       │    └── jede Transaktionszeile
       │         └── KategorieBadge        (inline, nur wenn kategorie gesetzt)
       └── [Tab 2: Kategorien]             (neu)
            └── TransactionCategoryManager (neu — eigenständige Komponente)
                 ├── CategoryRuleForm      (Anlegen: Felder Muster + Kategorie)
                 └── CategoryRulesTable
                      └── CategoryRuleRow  (Inline-Edit + Löschen mit Bestätigung)
```

---

## Datenmodell

### Neue Tabelle: `transaction_categories`

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER PK AUTOINCREMENT | Primärschlüssel |
| `muster` | TEXT NOT NULL UNIQUE | Substring-Muster (case-insensitiv) |
| `kategorie` | TEXT NOT NULL | Kategoriename (freier Text) |
| `created_at` | TEXT | ISO-Timestamp der Anlage |

**Matching-Logik (App-Layer):**
- Alle Regeln werden zusammen mit den Transaktionen geladen.
- Pro Transaktion: alle Regeln per `LOWER(beschreibung).includes(LOWER(muster))` prüfen.
- Gewinnt: die Regel mit dem längsten `muster` (bei Gleichstand: die neueste, d.h. höchste `id`).
- Keine gespeicherte Kategorie pro Transaktion — reine Laufzeit-Berechnung.

### API-Endpunkte (neu)

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/api/konto/transactions/categories` | Alle Regeln laden |
| POST | `/api/konto/transactions/categories` | Neue Regel anlegen |
| PUT | `/api/konto/transactions/categories/[id]` | Regel aktualisieren |
| DELETE | `/api/konto/transactions/categories/[id]` | Regel löschen |

### Geänderte API

| Methode | Pfad | Änderung |
|---------|------|---------|
| GET | `/api/konto/transactions` | Gibt `kategorie: string \| null` zusätzlich zurück (App-Layer Matching) |

---

## Technische Entscheidungen

**Warum App-Layer-Matching statt SQL?**  
Die "längster Treffer gewinnt"-Logik ist in SQLite nur mit komplexen Window-Functions abbildbar. Da wir <100 Regeln erwarten, ist es einfacher und wartbarer, alle Regeln einmal zu laden und das Matching in TypeScript zu machen.

**Warum `muster UNIQUE`?**  
Doppelte Muster würden zu inkonsistenten Ergebnissen führen. Beim Anlegen/Bearbeiten: `INSERT OR REPLACE` oder `UPDATE`.

**Kein Enum für Kategorienamen:**  
Kategorien sind freier Text. Keine Normalisierung in v1 — der Nutzer entscheidet selbst über Konsistenz (z.B. „Lebensmittel" vs. „lebensmittel").

**Tabs in TransactionList:**  
`shadcn/ui Tabs` (bereits installiert: `src/components/ui/tabs.tsx`) werden um die bestehende Transaktionsliste herum eingebaut. Der bestehende Inhalt wird zu Tab 1.

---

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/lib/db.ts` | Erweitern | Migration: `transaction_categories`-Tabelle anlegen (analog zu `transaction_aliases` in PROJ-26) |
| `src/app/api/konto/transactions/route.ts` | Erweitern | Kategorie-Feld via App-Layer-Matching zurückgeben |
| `src/app/api/konto/transactions/categories/route.ts` | Neu erstellen | GET + POST für Kategorieregeln |
| `src/app/api/konto/transactions/categories/[id]/route.ts` | Neu erstellen | PUT + DELETE für einzelne Regel |
| `src/components/transaction-list.tsx` | Erweitern | Tabs einbauen; `kategorie`-Badge in Transaktionszeile ergänzen; `Transaction`-Interface um `kategorie` erweitern |
| `src/components/transaction-category-manager.tsx` | Neu erstellen | Vollständiges UI für Kategorien-Tab: Formular + Tabelle mit Inline-Edit |
| `src/components/ui/tabs.tsx` | Nur lesen | Bereits installiert — Tab-Primitives direkt nutzen |
| `src/components/ui/badge.tsx` | Nur lesen | Kategorie-Badge in Transaktionszeile |
| `src/components/ui/alert-dialog.tsx` | Nur lesen | Lösch-Bestätigung in CategoryRuleRow |
| `src/components/transaction-alias-dialog.tsx` | Nur lesen | Vorlage für Formular-Dialog-Muster |
| `src/app/api/konto/transactions/alias/route.ts` | Nur lesen | Vorlage für API-Muster (Zod-Validierung, getDb-Pattern) |

---

## Kritische Typen (inline)

```typescript
// Erweiterung des Transaction-Interfaces in transaction-list.tsx
interface Transaction {
  id: number
  buchungsdatum: string
  valutadatum: string
  typ: string
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  betrag_cents: number
  periode: string
  kontoauszug_datei: string | null
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
  hidden: number
  alias: string | null
  logo_path: string | null
  kategorie: string | null  // NEU in PROJ-36
  [key: string]: unknown
}

// Neue Typen für Kategorieregeln
interface TransactionCategory {
  id: number
  muster: string
  kategorie: string
  created_at: string
}

// API-Request für POST/PUT
interface CategoryRulePayload {
  muster: string   // Pflichtfeld, mindestens 1 Zeichen
  kategorie: string // Pflichtfeld, mindestens 1 Zeichen
}
```

---

## Matching-Algorithmus (für Backend-Agent)

```
function matchKategorie(beschreibung: string, rules: TransactionCategory[]): string | null {
  const lower = beschreibung.toLowerCase()
  const matching = rules.filter(r => lower.includes(r.muster.toLowerCase()))
  if (matching.length === 0) return null
  // längster Treffer gewinnt; bei Gleichstand: höchste id
  matching.sort((a, b) => b.muster.length - a.muster.length || b.id - a.id)
  return matching[0].kategorie
}
```

Diese Funktion in `/api/konto/transactions/route.ts` nach dem Laden aller Transaktionen anwenden.

---

## Tests

### Bestehende Tests

| Datei | Aktion | Warum |
|-------|--------|-------|
| `src/app/api/konto/transactions/alias/route.test.ts` | Nur lesen | Vorlage für Test-Pattern — nicht anfassen |
| `src/app/api/konto/transactions/[id]/hide/route.test.ts` | Nur lesen | Vorlage für Test-Pattern — nicht anfassen |

### Neue Tests

| Datei | Typ | Was getestet wird |
|-------|-----|-------------------|
| `src/app/api/konto/transactions/categories/route.test.ts` | Unit (Vitest) | GET (leere + gefüllte DB), POST (valide/invalide Inputs), Duplikat-Muster |
| `src/app/api/konto/transactions/categories/[id]/route.test.ts` | Unit (Vitest) | PUT (update), DELETE (bekannte + unbekannte ID) |

---

## Nicht-lesen-Liste

Diese Verzeichnisse/Dateien sind für PROJ-36 nicht relevant:

- `src/app/api/bons/` — eBon-Logik, kein Bezug
- `src/app/api/avis/` — AVIS-Import-Logik
- `src/app/api/bestellung/` — Bestellungs-Logik
- `src/app/api/statistiken/` — Statistik-Auswertungen
- `src/app/api/paperless/` — Paperless-Sync
- `src/app/api/export/` — Datenexport
- `src/components/bon-detail.tsx`, `src/components/bon-list.tsx` — Bon-Ansicht
- `src/components/avis-*.tsx` — AVIS-Dialoge
- `src/lib/parser/` — PDF-Parser

---

<!-- Architecture complete. Next: /frontend to build UI, then /backend for API + DB -->
