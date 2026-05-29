# PROJ-50: Einheitliche PDF-Viewer-Komponente

## Status: Approved
**Created:** 2026-05-29
**Last Updated:** 2026-05-29
**QA Completed:** 2026-05-29
**Feature Folder:** `features/PROJ-50-pdf-viewer-komponente/`

## Dependencies
- PROJ-28 (PDF-Viewer in Bon-Detailansicht) — wird ersetzt
- PROJ-29 (Kontoauszug-PDF-Toggle in Transaktionsansicht) — wird ersetzt
- PROJ-35 (PDF-Inline-Ansicht in Import-History-Tabs) — wird ersetzt
- PROJ-31 (PDF-Highlight & Auto-Scroll) — wird in diese Komponente integriert (Status: In Review)

## Kontext
Drei unabhängige PDF-Viewer-Implementierungen sind gewachsen:
1. `bon-detail.tsx` — Bon-PDF mit Zoom/Navigation (PROJ-28)
2. `kontoauszug-pdf-viewer.tsx` — Kontoauszug-PDF mit Toggle (PROJ-29)
3. `import-history-table.tsx` — Inline-PDF in Import-History (PROJ-35)

Jede hat leicht andere Bedienung und Features. PROJ-31 (Highlight/Auto-Scroll) liegt zusätzlich quer über diesen drei Stellen. Ziel: eine einzige `<PdfViewer>`-Komponente, die alle drei Use-Cases per Props konfiguriert.

## User Stories
- Als Nutzer möchte ich in allen PDF-Ansichten eine konsistente Bedienung (Zoom, Navigation, Download) vorfinden, damit ich nicht in jeder Ansicht neu lernen muss.
- Als Nutzer möchte ich, dass der Viewer optional eine Textstelle im PDF hervorhebt und automatisch dorthin scrollt (Bon-Transaktions-Link), damit ich die relevante Zeile sofort sehe.
- Als Entwickler möchte ich eine einzige Komponente pflegen statt drei, damit Bug-Fixes an allen Stellen gleichzeitig wirken.

## Acceptance Criteria

### Neue Komponente `src/components/pdf-viewer.tsx`
- [ ] Props-Interface:
  - `src: string` — lokaler Dateipfad **oder** Paperless-Dokument-ID (string-union, Komponente erkennt Typ)
  - `highlight?: string` — optionaler Suchtext; wenn gesetzt, wird die erste Fundstelle markiert und automatisch gescrollt
  - `defaultZoom?: number` — initialer Zoom-Level (default: 1.0)
  - `toolbar?: boolean` — zeigt/versteckt Download + Extern-Öffnen (default: true)
  - `className?: string` — Tailwind-Klassen für den Container
- [ ] Implementiert Zoom (+ / − Buttons) und Seiten-Navigation (Prev / Next + aktuelle Seite / Gesamtseiten)
- [ ] Download-Button lädt die Datei herunter (lokaler Pfad: direkter Download; Paperless-ID: API-Proxy)
- [ ] Wenn `highlight` gesetzt: erste Fundstelle wird farbig markiert, Viewer scrollt automatisch zur Position
- [ ] Wenn `src` fehlt oder Datei nicht gefunden: leerer Zustand mit klarer Fehlermeldung ("PDF nicht gefunden")

### Ablösung der alten Implementierungen
- [ ] `bon-detail.tsx` nutzt die neue `<PdfViewer>`-Komponente statt eigener PDF-Logik
- [ ] `kontoauszug-pdf-viewer.tsx` wird durch `<PdfViewer>` ersetzt oder wrapped
- [ ] `import-history-table.tsx` nutzt `<PdfViewer>` für Inline-Darstellung
- [ ] Die alten PDF-spezifischen Code-Blöcke in diesen Dateien sind entfernt
- [ ] PROJ-31-Highlight-Logik ist in `<PdfViewer>` zentralisiert (nicht mehr in `bon-detail.tsx` separat)

### Verhalten unverändert
- [ ] Alle bisherigen Use-Cases (Bon-Detail, Kontoauszug-Toggle, Import-Inline) sehen und verhalten sich für den Nutzer identisch wie vorher
- [ ] Kein Regressions-Bug in den drei Einstiegspunkten

## Edge Cases
- PDF ist sehr groß (>10 MB): Laden zeigt Spinner; kein Timeout-Fehler in der UI
- `highlight`-Text kommt im PDF nicht vor: kein Fehler, kein leerer Zustand — Viewer öffnet sich auf Seite 1
- Paperless-ID ist ungültig oder Server nicht erreichbar: zeigt Fehlermeldung statt leerem Viewer
- `toolbar={false}` + Zoom-Buttons: Zoom bleibt per Props steuerbar (z.B. Import-History braucht keinen Download-Button, aber Zoom ist trotzdem sinnvoll) → `toolbar` steuert nur Download/Extern; Zoom/Navigation sind immer sichtbar
- Komponente wird mehrfach auf derselben Seite gerendert (z.B. Import-History mit mehreren PDFs): keine Konflikte zwischen Instanzen

## Technical Requirements
- Bibliothek: `react-pdf` (bereits installiert für bestehende Implementierungen) — keine neue Dep
- Paperless-Quellen: Loader nutzt bestehenden `/api/paperless/[id]/file`-Endpunkt
- Kein Breaking Change an den Props der drei Eltern-Komponenten — nur interne Implementierung wird ausgetauscht
