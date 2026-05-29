# Context Map: PROJ-48 Navigations-Konsolidierung

**Created:** 2026-05-29  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
layout.tsx
+-- Nav (nav.tsx) [ERWEITERN]
|   +-- Logo → /
|   +-- NavLink "Übersicht" → /
|   +-- NavLink "Analyse" → /analyse
|   +-- NavLink "Einstellungen" → /einstellungen
|   +-- ImportButton → öffnet ImportModal
|   +-- ConfigButton ⚙️ → ConfigDialog (unverändert)
+-- ImportModal (import-modal.tsx) [NEU]
    +-- Dialog (shadcn/ui)
        +-- ImportZone (bestehend, unverändert)

/ (page.tsx) [ERWEITERN]
+-- Überschrift "Bon-Übersicht"
+-- BonList (unverändert)
+-- PlaceholderCard "Achtung & Tipps" (PROJ-42, noch leer)

/analyse (page.tsx) [NEU]
+-- Tabs (shadcn/ui, URL-gesteuert via ?tab=)
    +-- Tab "Statistiken" → StatistikenHeader + StatistikDashboard
    +-- Tab "Produkte" → ProductList

/einstellungen (page.tsx) [NEU]
+-- Tabs (shadcn/ui, URL-gesteuert via ?tab=)
    +-- Tab "Konto" → TransactionList
    +-- Tab "Online-Bestellungen" → Bestellungs-Inhalt (Frontend findet Komponente)
    +-- Tab "HelloFresh" → HelloFresh-Inhalt (Frontend findet Komponente)
    +-- Tab "Backup" → Backup-Sektion aus ConfigDialog extrahieren
    +-- Tab "Paperless" → Paperless-Konfig (Frontend findet Komponente)

/import/page.tsx [UMBAU → redirect('/')]
/produkte/page.tsx [UMBAU → redirect('/analyse?tab=produkte')]
/statistiken/page.tsx [UMBAU → redirect('/analyse?tab=statistiken')]
/transaktionen/page.tsx [UMBAU → redirect('/einstellungen?tab=konto')]
```

### Data Model

Keine neuen Datenbankfelder oder -tabellen.  
Tab-State wird als URL-Query-Parameter (`?tab=statistiken`, `?tab=produkte`, etc.) gespeichert — bookmarkbar, Back-Button-kompatibel, kein localStorage.

### Tech Decisions

- **URL-Query-Parameter für Tabs** (`?tab=...`) statt `useState` oder `localStorage`: Jeder Tab-Zustand ist direkt verlinkbar und überlebt einen Browser-Refresh. Die shadcn `Tabs`-Komponente wird per `defaultValue` aus `useSearchParams()` gesteuert; bei Tab-Wechsel wird `router.replace()` aufgerufen.

- **Next.js `redirect()`** (serverseitig) in den alten `page.tsx`-Dateien: Der Browser sieht einen HTTP-Redirect noch vor dem Rendern — kein Flash, kein doppelter Render. Besser als `useEffect`-Redirect auf dem Client.

- **`Dialog` aus shadcn/ui** für das Import-Modal: Bereits installiert, konsistent mit anderen Modals in der App. `ImportZone` wird unverändert als Inhalt eingebettet — kein Refactoring der Drop-Logik nötig.

- **Backup-Logik aus ConfigDialog herauslösen**: Der Backup/Restore-Code liegt derzeit in `config-dialog.tsx` zusammen mit den Delete-Aktionen. Für den Einstellungen-Tab wird entweder (a) die Backup-Sektion als eigene Komponente `backup-section.tsx` extrahiert oder (b) der Einstellungen-Tab direkt `ConfigDialog` einbettet — Entscheidung beim Frontend-Developer (Option a bevorzugt, um ConfigDialog schlank zu halten).

- **Keine neuen API-Routen**: Dieses Feature ist eine reine UI-Reorganisation. Alle bestehenden API-Routen bleiben unverändert.

### Dependencies (packages to install)

Keine neuen Pakete. Alle nötigen shadcn/ui-Komponenten (`Tabs`, `Dialog`) sind bereits installiert.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** the files listed below.  
> Do NOT scan the codebase independently.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/nav.tsx` | Erweitern | Neue 3-Link-Struktur + Import-Button |
| `src/components/import-modal.tsx` | Neu erstellen | Dialog-Wrapper um ImportZone |
| `src/app/page.tsx` | Erweitern | Platzhalter-Card "Achtung & Tipps" hinzufügen |
| `src/app/analyse/page.tsx` | Neu erstellen | Neue Seite: Tabs Statistiken + Produkte |
| `src/app/einstellungen/page.tsx` | Neu erstellen | Neue Seite: Tabs Konto + Sekundär-Module |
| `src/app/import/page.tsx` | Erweitern | Umbau zu `redirect('/')` |
| `src/app/produkte/page.tsx` | Erweitern | Umbau zu `redirect('/analyse?tab=produkte')` |
| `src/app/statistiken/page.tsx` | Erweitern | Umbau zu `redirect('/analyse?tab=statistiken')` |
| `src/app/transaktionen/page.tsx` | Erweitern | Umbau zu `redirect('/einstellungen?tab=konto')` |
| `src/components/import-zone.tsx` | Nur lesen | Wird unverändert in ImportModal eingebettet |
| `src/components/product-list.tsx` | Nur lesen | Wird in /analyse Tab "Produkte" eingebettet |
| `src/components/statistik-dashboard.tsx` | Nur lesen | Wird in /analyse Tab "Statistiken" eingebettet |
| `src/components/statistiken-header.tsx` | Nur lesen | Wird in /analyse Tab "Statistiken" eingebettet |
| `src/components/transaction-list.tsx` | Nur lesen | Wird in /einstellungen Tab "Konto" eingebettet |
| `src/components/config-dialog.tsx` | Nur lesen | Backup-Logik hier — ggf. extrahieren zu backup-section.tsx |

### Wichtige Einstellungen-Tabs: Komponenten-Suche

Für die Tabs "Online-Bestellungen", "HelloFresh" und "Paperless" findet der Frontend-Developer die richtigen Komponenten über:
```
git ls-files src/components/ | grep -E "bestellung|hellofresh|paperless|import-history"
```
Diese Komponenten werden unverändert in die Tabs eingebettet — kein Refactoring.

### Kritische Typen & Interfaces

```typescript
// Nav: keine Props-Änderung, interne Restrukturierung

// ImportModal (neu)
interface ImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Für Tabs-State via URL (useSearchParams)
// In /analyse/page.tsx und /einstellungen/page.tsx:
// const tab = searchParams.get('tab') ?? 'statistiken' (bzw. 'konto')
// Kein expliziter Type nötig — plain string
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/` — alle API-Routen bleiben unverändert
- `src/app/bon/[id]/` — Bon-Detailansicht unverändert
- `src/components/ui/` — shadcn-Primitives, keine Änderung
- `src/lib/` — keine Utility-Änderung

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

Keine bestehenden Tests betroffen — alle Unit- und API-Tests testen Backend-Logik unabhängig von der Navigation.

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/PROJ-48-navigation.spec.ts` | E2E | Redirects prüfen (`/import` → `/`), Tab-Navigation (`/analyse?tab=produkte` zeigt ProductList), Import-Modal öffnet/schließt, Deep-Link `/bon/[id]` funktioniert |
