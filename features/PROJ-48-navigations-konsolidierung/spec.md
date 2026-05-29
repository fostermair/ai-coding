# PROJ-48: Navigations-Konsolidierung

## Status: In Progress
**Created:** 2026-05-29
**Last Updated:** 2026-05-29
**Feature Folder:** `features/PROJ-48-navigations-konsolidierung/`

## Dependencies
- PROJ-24, 25, 26, 29, 36 (Konto-Modul) — werden nach `/einstellungen/konto` verschoben
- PROJ-20, 21, 32, 33 (Online-Bestellungen/AVIS) — werden nach `/einstellungen/bestellungen` verschoben
- PROJ-37 (HelloFresh) — wird nach `/einstellungen/hellofresh` verschoben
- PROJ-30 (Backup) — wird nach `/einstellungen/backup` verschoben
- PROJ-18 (Paperless) — bleibt in Import-Drawer, Konfig in `/einstellungen`

## Kontext
Die App hat aktuell 5 gleichrangige Hauptbereiche: Bons · Import · Produkte · Statistiken · Transaktionen. Das Kernziel (Lebensmittel-Ausgaben analysieren) ist in der Navigation nicht dominant. Sekundär-Module (Kontoauszug, Bestellungen, HelloFresh) konkurrieren visuell mit dem Kern-Flow.

## User Stories
- Als Nutzer möchte ich die wichtigsten Analyse-Ansichten mit maximal einem Klick erreichen, damit ich nicht durch irrelevante Bereiche navigieren muss.
- Als Nutzer möchte ich Import schnell über einen Button in der Topbar starten können, ohne eine eigene Seite aufzurufen.
- Als Nutzer möchte ich alle Sekundär-Funktionen (Kontoauszug, Bestellungen, Aliase) unter Einstellungen finden, damit die Hauptnavigation übersichtlich bleibt.
- Als Nutzer möchte ich die Analyse (Statistiken + Produkte + Kategorien) unter einem Tab gebündelt sehen, damit verwandte Daten zusammen sind.
- Als Nutzer möchte ich die aktuelle URL-Struktur verlässlich vorfinden (keine toten Links), damit gespeicherte Bookmarks weiterhin funktionieren.

## Acceptance Criteria

### Neue Navigationsstruktur
- [ ] Topbar zeigt: Logo · **Übersicht** · **Analyse** · **Einstellungen** + rechts [Import ↗] + [⚙️ Konfiguration]
- [ ] `/` → **Übersicht**: bestehende Bons-Liste (unverändert); Platzhalter-Card für künftige "Achtung & Tipps" (PROJ-42)
- [ ] `/analyse` → **Analyse**: Tabs „Statistiken" (bestehender Inhalt aus `/statistiken`) · „Produkte" (bestehender Inhalt aus `/produkte`)
- [ ] `/einstellungen` → **Einstellungen**: Tabs für Konto · Online-Bestellungen · HelloFresh · Backup · Paperless · Aliase/Kategorien
- [ ] Import-Button öffnet ein Modal/Drawer mit dem bestehenden `ImportZone`-Inhalt (drag-drop + file picker)

### URL-Migration (Redirects)
- [ ] `/import` → redirect nach `/` (Import-Button in Topbar)
- [ ] `/produkte` → redirect nach `/analyse?tab=produkte`
- [ ] `/statistiken` → redirect nach `/analyse?tab=statistiken`
- [ ] `/transaktionen` → redirect nach `/einstellungen?tab=konto`
- [ ] Alle bestehenden Deep-Links (`/bon/[id]`, `/produkte/[name]`) bleiben unverändert erreichbar

### Sekundär-Module in Einstellungen
- [ ] Kontoauszug-Übersicht und Transaktionsliste sind unter `/einstellungen?tab=konto` erreichbar
- [ ] Bestellungs-Übersicht (PROJ-32/33) und AVIS-Status (PROJ-20/21) sind unter `/einstellungen?tab=bestellungen` erreichbar
- [ ] HelloFresh-Tab (PROJ-37) ist unter `/einstellungen?tab=hellofresh` erreichbar
- [ ] Backup (PROJ-30) ist unter `/einstellungen?tab=backup` erreichbar

### Konfiguration
- [ ] Das bestehende `ConfigDialog` (⚙️-Button) bleibt in der Topbar erreichbar — unverändert

## Edge Cases
- Nutzer hat einen `/produkte/[name]`-Link in der Adressleiste gespeichert → muss weiter funktionieren (kein Redirect für Deep-Links)
- Nutzer ist auf `/transaktionen` und lädt die Seite neu → sieht `/einstellungen?tab=konto` (Redirect bleibt permanent)
- Import-Modal: Wenn Import läuft und Nutzer auf einen Navlink klickt → Import-State muss erhalten bleiben (Modal bleibt offen oder warnt)
- `/analyse` wird direkt aufgerufen ohne Tab-Parameter → default-Tab ist „Statistiken"
- `/einstellungen` wird direkt aufgerufen ohne Tab-Parameter → default-Tab ist „Konto"

## Technical Requirements
- Next.js `redirect()` in alten `page.tsx`-Dateien für die Redirects (kein JS-only redirect)
- Tab-State per URL-Query-Parameter (`?tab=...`), damit Deep-Links bookmarkbar sind
- Import-Modal: `Dialog` aus shadcn/ui, öffnet sich über einen Button in der Nav; ImportZone-Komponente wird nicht dupliziert, sondern importiert
- Keine neuen Seiten für Sekundär-Inhalte anlegen — bestehende Komponenten in die Einstellungs-Tabs verschieben
