# Context Map: PROJ-31 PDF-Highlight & Auto-Scroll in Transaktionsansicht

**Created:** 2026-05-24  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
TransactionList (src/components/transaction-list.tsx)
+-- Group Header Row
|   +-- FileText button → öffnet PDF ohne Highlight (bestehend, kein highlightedTxId)
|   +-- Gruppen-Metadaten (Periode, Summe, etc.)
+-- Transaction Rows (neu: jede Zeile wird klickbar)
|   +-- onClick → öffnet PDF der Gruppe + setzt highlightedTxId
+-- KontoauszugPdfViewer [NEU] (src/components/kontoauszug-pdf-viewer.tsx)
    +-- react-pdf <Document> (lädt /api/konto/statements/{periode}/pdf)
    |   +-- react-pdf <Page> × N (rendert alle Seiten mit Text-Layer)
    +-- HighlightOverlay (gelbes div über dem gematchten Text-Element)
```

### Data Model

Kein Datenbankschema wird geändert. Alle benötigten Felder sind bereits im `Transaction`-Interface vorhanden:

```
Jede Transaction hat (relevant für dieses Feature):
- buchungsdatum: string (YYYY-MM-DD in DB, wird zu DD.MM.YYYY formatiert für Text-Suche)
- betrag_cents: number (z.B. -2550 → formatiert als "-25,50" für Text-Suche)
- kontoauszug_datei: string | null (muss mit "[paperless]" beginnen, damit PDF verfügbar)
- periode: string (z.B. "2026-01", wird für PDF-URL verwendet)
- id: number (wird als highlightedTxId gespeichert)
```

Neuer UI-State (nur React, kein Persist):
- `highlightedTxId: number | null` — welche Transaktion aktuell hervorgehoben wird

### Tech Decisions

**Warum `react-pdf` statt `<iframe>` behalten?**  
Ein iframe rendert das PDF in einem sandboxten Browser-Kontext ohne zugängliches DOM. `react-pdf` rendert via PDF.js in echte React-DOM-Elemente (Canvas + Text-Layer `<span>`), auf die JavaScript zugreifen, Overlays positionieren und scrollen kann. Ohne das ist Highlight und Auto-Scroll physisch unmöglich.

**Warum separates `KontoauszugPdfViewer`-Component?**  
Die Highlight+Scroll-Logik ist komplex (seitenweises Suchen, async Text-Layer-Bereitschaft, Overlay-Positionierung). Auslagern hält `transaction-list.tsx` lesbar und macht den Viewer unabhängig testbar.

**Such-Schlüssel-Format:**  
`buchungsdatum` als `DD.MM.YYYY` + `betrag_cents` als `-25,50`. Diese zwei Strings identifizieren die Buchungszeile im PDF-Text-Layer eindeutig. Bei mehreren Treffern wird der erste akzeptiert (laut Spec).

**Fallback:** Wenn kein Text-Match gefunden (gescanntes PDF oder Format-Abweichung), öffnet das PDF normal ohne Highlight.

### Dependencies (packages to install)

- `react-pdf` — React-Wrapper für PDF.js, exponiert Text-Layer als DOM-Elemente

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) lesen **NUR** die unten gelisteten Dateien.
> Kein eigenständiges Codebase-Scanning.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/transaction-list.tsx` | Erweitern | `highlightedTxId`-State hinzufügen, Transaction-Row-onClick, `<iframe>` durch `<KontoauszugPdfViewer>` ersetzen |
| `src/components/kontoauszug-pdf-viewer.tsx` | Neu erstellen | Neue Komponente: react-pdf Document+Pages + Highlight-Overlay + Auto-Scroll |
| `src/app/api/konto/statements/[periode]/pdf/route.ts` | Nur lesen | Gleiche URL, wird jetzt von react-pdf statt iframe konsumiert — keine Änderung nötig |
| `features/PROJ-31-pdf-highlight-scroll/spec.md` | Nur lesen | Feature-Anforderungen & Edge Cases |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// Aus src/components/transaction-list.tsx (vollständig kopiert, nicht neu öffnen nötig)
interface Transaction {
  id: number
  buchungsdatum: string       // YYYY-MM-DD — für Highlight: formatieren zu DD.MM.YYYY
  valutadatum: string
  typ: string
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  betrag_cents: number        // z.B. -2550 — für Highlight: formatieren zu "-25,50"
  periode: string             // z.B. "2026-01" — für PDF-URL
  kontoauszug_datei: string | null  // "[paperless] Dateiname" → PDF verfügbar
  match_status: 'unmatched' | 'matched' | 'pending' | 'virtual' | 'ignored'
  matched_receipt_id: number | null
  match_source: 'auto' | 'manual' | null
  hidden: number
  alias: string | null
  logo_path: string | null
}

// Hilfs-Funktion bereits vorhanden in transaction-list.tsx:
// function stripPaperlessPrefix(datei: string | null): string | null
// → entfernt "[paperless] " Prefix für Anzeige

// Props für den neuen KontoauszugPdfViewer:
interface KontoauszugPdfViewerProps {
  periode: string                    // z.B. "2026-01" → /api/konto/statements/2026-01/pdf
  highlightTx: Transaction | null    // null = kein Highlight (öffnen via Gruppen-Button)
}
```

### Toggle-Logik für Transaction Rows (für Frontend-Agent)

```
Klick auf Zeile mit [paperless]-PDF:
  - Gleiche TX bereits highlighted + PDF offen → PDF schließen (pdfGroups entfernen, highlightedTxId = null)
  - Andere TX in gleicher Gruppe → nur highlightedTxId aktualisieren (pdfGroups bleibt)
  - TX in anderer Gruppe → alte Gruppe aus pdfGroups entfernen, neue hinzufügen, highlightedTxId setzen
  - PDF noch nicht offen → pdfGroups hinzufügen, highlightedTxId setzen

Klick auf Gruppen-FileText-Button (bestehend):
  - Bestehende togglePdfMode-Logik behalten
  - highlightedTxId auf null setzen (kein Highlight beim Öffnen via Gruppen-Button)
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/components/ui/` — shadcn-Komponenten, keine Änderung
- `src/app/api/bons/` — eBon-PDF-Routes, nicht betroffen
- `src/components/bon-detail.tsx` — Bon-Detail-Viewer, nicht betroffen
- `src/app/api/konto/transactions/` — Transaktions-API-Routes, keine Änderung
- `src/components/transaction-alias-dialog.tsx` — unberührt
- `src/components/transaction-assign-dialog.tsx` — unberührt
- `src/lib/`, `src/hooks/` — keine neuen Hooks oder Utils nötig

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `tests/PROJ-29-kontoauszug-pdf-toggle.spec.ts` | E2E | Testet den Gruppen-FileText-Button PDF-Toggle — Regression prüfen, da TransactionList geändert wird |

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/PROJ-31-pdf-highlight-scroll.spec.ts` | E2E | Je ein `test()` pro Acceptance Criterion: Klick öffnet PDF, Highlight sichtbar, Scroll, Toggle schließt, Klick auf andere TX verschiebt Highlight, Gruppen-Button ohne Highlight |
