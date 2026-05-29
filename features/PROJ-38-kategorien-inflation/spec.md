# PROJ-38: Kategorien-Inflation

## Metadata
- **Status:** Approved
- **Created:** 2026-05-29
- **Dependencies:** PROJ-45 (Auto-Kategorisierung — product_categories-Tabelle + Kategorie-Zuweisung)

## Ziel
Produkte in Kategorien gruppieren (via `product_categories.alias → category`) und die Preisinflation pro Kategorie über Zeit zeigen. Neue Statistik-Card "Inflation nach Kategorie" auf `/statistiken`.

**Kernwert:** "Milchprodukte +9% YoY" sagt mehr als 30 Einzelartikel.

---

## User Stories

**US1 — Kategorie-Inflationsübersicht:**
Als Nutzer möchte ich auf `/statistiken` sehen, um wie viel % jede Produktkategorie im Vergleich zum Vorjahr teurer oder günstiger geworden ist — damit ich die teuersten Kategorien auf einen Blick erkenne.

**US2 — Sortierung nach Stärke:**
Als Nutzer möchte ich die Kategorien nach Inflationsstärke sortiert sehen (höchste Steigerung oben) — damit ich die relevantesten Hebel priorisieren kann.

**US3 — Ausschluss nicht-lebensmittelbezogener Kategorien:**
Als Nutzer möchte ich, dass Pfand, Tabak und Drogerie standardmäßig ausgeblendet sind, aber über einen Toggle eingeblendet werden können — damit die Lebensmittel-Inflation unverfälscht bleibt.

**US4 — Drill-Down zu Produkten:**
Als Nutzer möchte ich auf eine Kategorie klicken und zur Produktliste dieser Kategorie navigieren — damit ich sehe, welche Produkte innerhalb der Kategorie besonders stark gestiegen sind.

---

## Acceptance Criteria

### API
- [ ] `GET /api/statistiken/kategorien-inflation` liefert ein Array `[{ category, inflation_pct, product_count, avg_current_price_cents, avg_prev_price_cents }]`
- [ ] Sortierung: `inflation_pct DESC` (höchste Steigerung zuerst)
- [ ] Berechnung: Ø `unit_price_cents` pro Kategorie im aktuellen Kalenderjahr vs. Vorjahr
  - Verknüpfung: `receipt_items.raw_name` → `product_aliases.alias` → `product_categories.category`
  - Nur `item_type = 'product'`; Pfand/Rabatte ausgeschlossen
- [ ] Query-Parameter `include_excluded=true` bezieht Kategorien mit `default_excluded_from_stats = true` ein
- [ ] Kategorien mit Einkäufen in nur einem Jahr liefern `inflation_pct: null`
- [ ] Produkte ohne Kategorie werden unter `"Sonstiges"` aggregiert

### UI (Card auf `/statistiken`)
- [ ] Card-Titel: "Inflation nach Kategorie"
- [ ] Erscheint nach der Monatstrend-Card, vor der Top-Produkte-Card
- [ ] Pro Zeile: Kategoriename | Inflationswert als Badge (rot = +, grün = -, grau = keine Daten) | Anzahl Produkte
- [ ] Toggle "Ausgeschlossene Kategorien einblenden" (standardmäßig aus)
- [ ] Leer-Zustand: "Keine Kategoriedaten — importiere Bons und weise Kategorien zu (PROJ-45)"
- [ ] Klick auf Zeile navigiert zu `/produkte?category=<kategorie>` (US4)

---

## Edge Cases

- **Alias ohne Kategorie:** Fällt automatisch in "Sonstiges"; kein Fehler.
- **Kategorie nur in einem Jahr:** `inflation_pct = null`; Zeile erscheint mit "(keine Vergleichsdaten)".
- **Preisveränderung = 0%:** Neutrale Darstellung (kein Pfeil, grauer Badge "±0%").
- **Keine Bons importiert:** Card zeigt Leer-Zustand.
- **Alle Kategorien excluded:** Toggle-Hinweis, dass alle ausgeblendet sind.

---

## Nicht im Scope
- Saisonal-Korrektur (kommt erst mit PROJ-42 Spar-Alerts)
- Kategorie-Detailseite (eigene Route) — Drill-Down via PROJ-49 reicht zunächst
- Historische Chart-Ansicht pro Kategorie (kann als PROJ-38b folgen)
