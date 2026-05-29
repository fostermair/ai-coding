# Context Map: PROJ-50 Einheitliche PDF-Viewer-Komponente

**Created:** 2026-05-29  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Ist-Zustand: drei verschiedene Implementierungen

| Komponente | Ansatz | Features |
|---|---|---|
| `bon-detail.tsx` (EBon/AVIS/Bestellung-Tabs) | `<iframe src="/api/bons/[id]/pdf">` | keine — reiner Browser-Iframe |
| `kontoauszug-pdf-viewer.tsx` | `react-pdf` + Text-Layer-DOM | Highlight + Scroll, Loader, Error |
| `import-history-table.tsx` (inline PDF) | `<iframe src={blobUrl}>` nach Blob-Fetch | keines — Blob-Fetch + Iframe |

**Kernbefund:** `kontoauszug-pdf-viewer.tsx` ist bereits die vollwertigste Implementierung — sie wird zur Grundlage der neuen `<PdfViewer>`-Komponente. Die beiden Iframe-Implementierungen werden abgelöst.

---

### Component Structure

```
pdf-viewer.tsx [NEU]
+-- Toolbar (wenn toolbar=true)
|   +-- Seiten-Navigation (Prev / Next / "Seite X / N")
|   +-- Zoom-Buttons (+ / −)
|   +-- Download-Button
|   +-- Extern-Öffnen-Button
+-- Document (react-pdf)
    +-- Page × numPages (react-pdf, mit renderTextLayer=true)
    +-- Highlight-Overlay div (DOM-Insert wie in kontoauszug-pdf-viewer)
+-- LoadingState (Loader2 + Text)
+-- ErrorState (Alert, shadcn/ui)

bon-detail.tsx [ERWEITERN]
  EBon-Tab:        <iframe> → <PdfViewer src="/api/bons/[id]/pdf" toolbar={false} />
  AVIS-Tab:        <iframe> → <PdfViewer src="/api/bons/[id]/avis-pdf" toolbar={false} />
  Bestellung-Tab:  <iframe> → <PdfViewer src="/api/bons/[id]/bestellung-pdf" toolbar={false} />

kontoauszug-pdf-viewer.tsx [ERWEITERN]
  Gesamte react-pdf + Highlight-Logik → auslagern in PdfViewer
  Wrapper-Komponente bleibt bestehen (handhabt Transaction → highlight-String-Konvertierung)
  Eigene Highlight-Logik → entfernen; PdfViewer-prop highlight={searchString} nutzen

import-history-table.tsx [ERWEITERN]
  Blob-Fetch + <iframe> (ab Zeile ~268) → <PdfViewer src="/api/import/pdf?type=…&id=…" toolbar={false} />
  Kein Blob-Fetch mehr nötig
```

### Data Model

Kein Datenbankzugriff. Die Komponente lädt PDFs über bestehende API-Endpunkte. Kein neuer Zustand in der Datenbank.

Interner Zustand (React `useState`):
- `numPages: number` — Gesamtseiten nach Document-Load
- `pageNumber: number` — aktuell angezeigte Seite
- `scale: number` — aktueller Zoom (Standardwert aus `defaultZoom`-Prop)
- `loading: boolean`
- `error: string | null`

### Tech Decisions

- **`react-pdf` statt `<iframe>` für alle Viewer:** Nur mit `react-pdf` ist Programmatic Zoom, Text-Layer-Zugriff und Highlight + Auto-Scroll möglich. Die `<iframe>`-Variante wird abgelöst, weil sie diese Features grundsätzlich nicht unterstützt. `react-pdf` ist bereits installiert und im Einsatz.

- **Highlight-Logik aus `kontoauszug-pdf-viewer.tsx` extrahieren:** Die Suche im Text-Layer (DOM-Scan, Row-Matching, Highlight-Div-Injektion) ist bewährt und wird 1:1 in `pdf-viewer.tsx` integriert. Kein Redesign.

- **`src` ist immer eine URL (kein raw Pfad):** Alle drei bestehenden Implementierungen übergeben bereits API-URL-Pfade. Die Komponente ruft `fetch(src)` nicht auf — `react-pdf`'s `Document file={src}` übernimmt den HTTP-Request direkt.

- **`toolbar` steuert nur Download + Extern — Zoom/Navigation immer sichtbar:** Bon-Detail braucht kein Download, aber Zoom ist trotzdem sinnvoll (Spec-Edge-Case). Deshalb zwei getrennte boolean-Controls wären overengineered — `toolbar=false` versteckt nur die sekundären Aktionen.

- **`kontoauszug-pdf-viewer.tsx` bleibt als dünner Wrapper:** Die Komponente übersetzt `Transaction`-Objekte in einen Highlight-Suchstring (Datum + Betrag-Tokens). Diese Logik gehört nicht in `pdf-viewer.tsx` (zu domain-spezifisch). Der Wrapper wird auf ~30 Zeilen schrumpfen.

- **Keine neuen API-Routen:** Alle bestehenden PDF-Endpunkte werden unverändert weitergenutzt.

### Dependencies (packages to install)

Keine neuen Pakete. `react-pdf` ist bereits installiert (`kontoauszug-pdf-viewer.tsx` nutzt es).

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** the files listed below.  
> Do NOT scan the codebase independently.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/pdf-viewer.tsx` | Neu erstellen | Die neue einheitliche Komponente |
| `src/components/kontoauszug-pdf-viewer.tsx` | Erweitern | Highlight-Logik in PdfViewer auslagern; Wrapper drastisch vereinfachen |
| `src/components/bon-detail.tsx` | Erweitern | 3× `<iframe>` → `<PdfViewer>` (EBon, AVIS, Bestellung-Tabs) |
| `src/components/import-history-table.tsx` | Erweitern | Blob-Fetch + `<iframe>` → `<PdfViewer>` (ca. Zeile 268–296) |

### Kritische Typen & Interfaces

```typescript
// pdf-viewer.tsx (NEU)
interface PdfViewerProps {
  src: string               // URL-Pfad zum PDF, z.B. "/api/bons/1/pdf"
  highlight?: string        // Suchtext für Highlight + Auto-Scroll
  defaultZoom?: number      // Initialer Scale-Faktor (default: 1.0)
  toolbar?: boolean         // Download + Extern-Button anzeigen (default: true)
  className?: string
}

// kontoauszug-pdf-viewer.tsx — Props bleiben UNVERÄNDERT
interface KontoauszugPdfViewerProps {
  periode: string
  highlightTx: Transaction | null
  onClose: () => void
}

// Transaction-Interface aus kontoauszug-pdf-viewer.tsx (für Wrapper-Logik)
interface Transaction {
  id: number
  buchungsdatum: string    // "YYYY-MM-DD"
  betrag_cents: number
  beschreibung?: string
  [key: string]: unknown
}

// Helper in kontoauszug-pdf-viewer.tsx (bleibt intern):
// formatDateForSearch(dateStr: string): string  → "DD.MM.YYYY"

// bon-detail.tsx PDF-Tabs (EBon, AVIS, Bestellung):
// Vor:  <iframe src={`/api/bons/${bonId}/pdf`} ...>
// Nach: <PdfViewer src={`/api/bons/${bonId}/pdf`} toolbar={false} />

// import-history-table.tsx inline PDF:
// Vor:  fetch(...) → blob URL → <iframe src={blobUrl}>
// Nach: <PdfViewer src={`/api/import/pdf?type=${type}&id=${id}`} toolbar={false} />
```

### Highlight-Logik (aus kontoauszug-pdf-viewer.tsx übernehmen)

Die Highlight-Mechanik nutzt den `react-pdf` Text-Layer. Key-Functions die in `pdf-viewer.tsx` landen:
- `getRowItems(items, anchor)` — findet alle DOM-Elemente in derselben PDF-Zeile (±3px Toleranz)
- `trySearchAndHighlight(highlight: string)` — DOM-Scan über `.react-pdf__Page__textContent`, injiziert ein absolut positioniertes `div.tx-highlight`
- `scheduleSearch(attempt)` — Retry-Schleife mit Delays `[200, 500, 1000, 2000, 3500]ms` (Text-Layer ist nicht sofort verfügbar)

In `pdf-viewer.tsx` wird `highlight`-prop zum Suchstring — kein Transaction-Objekt mehr.  
`kontoauszug-pdf-viewer.tsx` übersetzt `highlightTx → searchString` selbst und übergibt ihn.

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/` — alle API-Routen bleiben unverändert
- `src/components/ui/` — shadcn-Primitives, keine Änderung
- `src/lib/` — keine Utility-Änderung
- `src/app/bon/[id]/` — `page.tsx` bleibt unverändert; nur `bon-detail.tsx` wird geändert
- `src/components/transaction-list.tsx` — nicht betroffen (nutzt `kontoauszug-pdf-viewer` über Props, kein internes PDF)

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

Keine bestehenden Tests betroffen — alle Unit-Tests testen API/Parsing-Logik; keine UI-Komponenten-Tests vorhanden.

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/PROJ-50-pdf-viewer.spec.ts` | E2E | Bon-Detail EBon-Tab öffnet PDF; Kontoauszug-PDF öffnet + Highlight-Zeile sichtbar; Import-History-Inline zeigt PDF; Kein `<iframe>` mehr in diesen Komponenten |
