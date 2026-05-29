# PROJ-49: Statistik-Drill-Down

## Metadata
- **Status:** Architected
- **Created:** 2026-05-29
- **Dependencies:** PROJ-38 (für Kategorien-Drill-Down-Zeile); alle anderen Drill-Downs unabhängig implementierbar

## Ziel
Jede Statistik-Card auf `/statistiken` wird klickbar und navigiert mit einem Klick zur passenden Detail-Ansicht (Produkt, Kategorie, Bon-Liste gefiltert nach Monat). Keine neuen Routen nötig — alle Drill-Downs nutzen bestehende Seiten und Komponenten via Query-Parameter.

**Kernwert:** User-Journey von Insight zu Detail in einem Klick. Aktiviert den Wert der bestehenden Statistiken.

---

## User Stories

**US1 — Monatstrend → Bon-Liste:**
Als Nutzer möchte ich in der Monatstrend-Card auf einen Balken klicken und alle Bons des entsprechenden Monats sehen — damit ich verstehe, welche Einkäufe für einen hohen Monatsbetrag verantwortlich sind.

**US2 — Top-Produkte → Preis-Chart:**
Als Nutzer möchte ich in den "Top-Produkte"- und "Häufigste Produkte"-Cards auf ein Produkt klicken und dessen Preisentwicklungs-Chart öffnen — damit ich bei einem teuren Produkt gleich sehe, ob der Preis gestiegen ist.

**US3 — Kategorien-Inflation → Produktliste:**
Als Nutzer möchte ich in der Kategorien-Inflation-Card (PROJ-38) auf eine Kategorie klicken und zur Produktliste dieser Kategorie navigieren — damit ich die Einzelprodukte hinter der Kategorie-Zahl sehe.

**US4 — Visuelles Feedback:**
Als Nutzer möchte ich sehen, welche Elemente klickbar sind (Cursor-Wechsel, Hover-Hervorhebung) — damit ich die Interaktivität der Statistiken intuitiv erkenne.

---

## Acceptance Criteria

### Monatstrend-Balken (US1)
- [ ] Klick auf einen Balken navigiert zu `/` (Bon-Übersicht) mit Query-Params `?from=YYYY-MM-01&to=YYYY-MM-31`
- [ ] Bon-Übersicht wertet `from`/`to`-Parameter aus und filtert die Bon-Liste entsprechend
- [ ] Falls Bon-Übersicht bereits Filter unterstützt (API hat `from`/`to`): nur URL-Param-Übergabe nötig
- [ ] Tooltip beim Hover: "Alle Bons vom Monat anzeigen"

### Top-Produkte & Häufigste Produkte (US2)
- [ ] Klick auf ein Produkt in diesen Cards öffnet `PriceChartSheet` (bestehende Komponente aus `product-list.tsx`) für das gewählte Produkt
- [ ] Kein Routing nötig — Sheet öffnet sich inline auf `/statistiken`
- [ ] Alternativ: Klick navigiert zu `/produkte` mit dem Produkt-Sheet bereits geöffnet via Query-Param `?product=<raw_name>` — bevorzugt, falls Sheet-State nicht einfach liftable ist

### Kategorien-Inflation-Card (US3, abhängig von PROJ-38)
- [ ] Klick auf eine Kategorie-Zeile navigiert zu `/produkte?category=<kategorie>`
- [ ] Produktliste filtert automatisch nach der Kategorie (bestehender Kategorie-Filter in Produktliste)
- [ ] Funktioniert nur wenn PROJ-38 implementiert ist; ohne PROJ-38 wird dieser Drill-Down nicht eingebaut

### Visuelles Feedback (US4)
- [ ] Cursor wechselt zu `pointer` auf allen klickbaren Datenpunkten/Zeilen
- [ ] Hover-Hervorhebung: leichte Hintergrundfarbe-Änderung (Tailwind `hover:bg-muted/50` o.ä.)
- [ ] Klickbare Zeilen/Balken sind klar von reinen Anzeige-Elementen unterscheidbar

### Leer-Zustand
- [ ] Keine Bons importiert → Cards zeigen bestehenden Leer-Zustand; Klick auf leere Cards tut nichts (kein Fehler)
- [ ] Monat mit 0 Bons: Navigation zur Bon-Liste mit Filter funktioniert, zeigt leere Liste mit Hinweis

---

## Umsetzungsreihenfolge (intern)

1. **Monatstrend → Bon-Liste** (US1): Einfachste Implementierung, keine Komponentenänderung nötig — nur `onClick` + `router.push`
2. **Top-Produkte → PriceChartSheet** (US2): PriceChartSheet aus product-list.tsx auf /statistiken-Seite mitimportieren
3. **Kategorien-Drill-Down** (US3): Erst nach PROJ-38

---

## Edge Cases

- **Produkt-Name mit Sonderzeichen in URL:** URL-encode bei Query-Param-Übergabe.
- **Kategorie-Name mit Leerzeichen** (z.B. "Brot & Backwaren"): URL-encode.
- **PriceChartSheet auf /statistiken:** Muss ohne Produktlisten-State auskommen — Sheet-Öffnen via lokalem State auf der Statistiken-Seite.
- **Navigationsziel existiert nicht:** Kein Fehler; leere Seite mit "Keine Daten gefunden".

---

## Nicht im Scope
- Neue Detail-Routen (z.B. `/statistiken/kategorie/milchprodukte`) — zu viel Overhead; Query-Params reichen
- Drill-Down für Rabatt-Tracking-Card (niedrige Priorität; kann später folgen)
- Drill-Down für MwSt-Aufteilung-Card (Mehrwert unklar)
- Breadcrumb-Navigation zurück zu Statistiken (Browser-Back reicht)
