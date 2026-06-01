# Context Map: PROJ-53 Ausgaben-Lebenszyklus-Status

**Created:** 2026-06-01  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
bon-list.tsx (erweitern)
└── TableHeader: neue "Status"-Spalte hinzufügen
└── TableRow: neue TableCell mit LifecycleStatusBadge
    └── LifecycleStatusBadge (neu erstellen)
        ├── shadcn Badge
        └── shadcn Tooltip (erklärt Status im Hover)
```

### Data Model

Keine neuen Felder oder DB-Änderungen. Alle 4 Felder sind bereits in der `/api/bons`-Response vorhanden:

```
BonSummary (bestehend, keine Änderung):
- is_virtual: number (0 = echter eBon, 1 = nur Bank-Eintrag)
- item_count: number (Anzahl der receipt_items)
- avis_status: 'complete' | 'pending' | 'no_matches' | null
- has_bestellung: number (0 oder 1)

Optional für PROJ-52 (Ausgaben-Ledger) vorbereiten:
- source?: 'hellofresh' — ermöglicht HelloFresh-Badge ohne Änderung am Komponenten-Interface
```

### Status-Ableitung (client-seitig, Priorität absteigend)

| Priorität | Bedingung | Badge | Farbe | Tooltip |
|-----------|-----------|-------|-------|---------|
| 1 | `source === 'hellofresh'` | HelloFresh | Lila | HelloFresh-Bestellung |
| 2 | `is_virtual = 1` ODER `item_count = 0` | Konto | Grau | Kein eBon importiert — nur Kontoauszug vorhanden |
| 3 | `has_bestellung = 1` ODER `avis_status = 'complete'` | Vollständig | Grün | eBon vollständig verifiziert |
| 4 | `item_count > 0` | Beleg | Blau | eBon vorhanden, aber noch nicht verifiziert |
| Fallback | — | Konto | Grau | Kein eBon importiert |

### Tech Decisions

- **Client-seitig abgeleitet** — keine API-Änderung, kein DB-Schema-Change
- **Neuer, eigenständiger Badge** neben bestehenden AVIS/Bestellung-Badges (kein Ersetzen)
- **Shadcn Badge + Tooltip** — konsistent mit bestehendem `AvisStatusBadge`-Pattern
- **`source`-Prop optional** — future-proofing für PROJ-52, ohne Breaking Change

### Dependencies

Keine neuen Packages — shadcn Badge und Tooltip sind bereits installiert.

---

## Context Map

> ⚠️ Downstream agents (Frontend, QA) lesen **NUR** die hier gelisteten Dateien.
> Kein eigenständiges Codebase-Scanning.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/lifecycle-status-badge.tsx` | Neu erstellen | Neue Badge-Komponente mit Tooltip |
| `src/components/bon-list.tsx` | Erweitern | Neue "Status"-Spalte (TableHeader + TableCell) hinzufügen |
| `src/components/avis-status-badge.tsx` | Nur lesen | Referenz-Pattern für Badge-Aufbau (shadcn Badge + Lucide Icon) |
| `src/app/api/bons/route.ts` | Nur lesen | Bestätigung, dass alle 4 Felder bereits zurückgegeben werden |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// Bestehend in BonSummary (src/app/api/bons/route.ts) — keine Änderung nötig
interface BonSummary {
  id: number
  receipt_date: string
  item_count: number          // COUNT(*) FROM receipt_items — bereits vorhanden
  is_virtual?: number         // 0 oder 1 — bereits vorhanden
  avis_status?: "complete" | "pending" | "no_matches" | null  // bereits vorhanden
  has_bestellung?: number     // 0 oder 1 — bereits vorhanden
  total_amount_cents: number
  store_chain?: string
  // ... weitere Felder
}

// Neu: Props für LifecycleStatusBadge
interface LifecycleStatusBadgeProps {
  is_virtual?: number
  item_count: number
  avis_status?: "complete" | "pending" | "no_matches" | null
  has_bestellung?: number
  source?: "hellofresh"  // für PROJ-52 Ausgaben-Ledger
}

// Neu: Internes Status-Derivat
type LifecycleStatus = "konto" | "beleg" | "vollstaendig" | "hellofresh"
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/konto/` — Kontoauszug-Logik, unberührt
- `src/app/api/avis/` — AVIS-Matching, unberührt (liefert nur Daten, keine Änderung)
- `src/app/api/bestellung/` — Bestellung-Import, unberührt
- `src/lib/` — DB-Schema, Parser, Matching-Logik — alles unberührt
- `src/components/ui/` — shadcn, keine Änderung

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `tests/PROJ-2-bon-uebersicht.spec.ts` | E2E | Bon-Liste — neue Spalte könnte Selektoren verschieben, Regression prüfen |
| `tests/PROJ-20-avis-bon-review.spec.ts` | E2E | Verwendet AVIS-Spalte in bon-list, prüfen ob neue Spalte Konflikte erzeugt |
| `tests/PROJ-47-bulk-alias-worklist.spec.ts` | E2E | Interagiert mit bon-list, Regression prüfen |

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `src/components/lifecycle-status-badge.test.tsx` | Unit | Status-Ableitung für alle 6 Fälle: konto (virtual), konto (item_count=0), beleg, vollständig (avis), vollständig (bestellung), hellofresh |
| `tests/PROJ-53-lebenszyklus-status.spec.ts` | E2E | Ein `test()` pro Acceptance Criterion: Badge sichtbar, korrekte Farben, Tooltip erscheint |
