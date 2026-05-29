# PROJ-39: Preis-pro-Einheit-Normalisierung

## Metadata
- **Status:** Approved
- **Created:** 2026-05-29
- **Dependencies:** Keine (kann sofort nach PROJ-38/45 starten)
- **Voraussetzung für:** PROJ-43 (Multi-Store-Preisvergleich), PROJ-41 (Substitutions-Erkennung)

## Ziel
Aus `receipt_items.raw_name` Mengenangaben extrahieren und drei neue Felder in `receipt_items` befüllen: `normalized_amount`, `normalized_unit`, `price_per_unit_cents`. Dadurch werden Vergleiche zwischen verschiedenen Packungsgrößen desselben Produkts möglich ("BUTTER 250G vs. BUTTER 500G" → beide in €/100g).

**Kernwert:** Vergleich zwischen Packungsgrößen wird valide. Grundlage für alle Preisvergleiche in Sprint 3+.

---

## User Stories

**US1 — Preis pro 100g im Produktnamen:**
Als Nutzer möchte ich bei "BUTTER LANDLIEBE 250G" den Preis pro 100g angezeigt bekommen — damit ich 250g- und 500g-Packungen direkt vergleichen kann.

**US2 — Backfill für Bestandsdaten:**
Als Nutzer möchte ich, dass auch meine bereits importierten Bons rückwirkend normalisiert werden — damit die Statistiken vollständig sind ohne Re-Import.

**US3 — Einheitsspalte in Produktliste:**
Als Nutzer möchte ich in der Produktliste eine zusätzliche Spalte "€/Einheit" sehen (wenn Normalisierung verfügbar ist) — damit ich günstige Packungsgrößen auf einen Blick erkenne.

---

## Acceptance Criteria

### Datenbank-Migration
- [ ] Neue Felder in `receipt_items` (nullable):
  - `normalized_amount REAL` — extrahierte Menge in Basis-Einheit (g, ml, Stück)
  - `normalized_unit TEXT` — normalisierte Einheit: `"g"`, `"ml"`, `"Stück"`
  - `price_per_unit_cents INTEGER` — Preis pro 100g/100ml bzw. pro Stück (immer Integer, gerundet)
- [ ] Migration läuft ohne Datenverlust auf bestehenden Datenbanken

### Parser-Heuristik (`src/lib/unit-parser.ts`)
- [ ] Erkennt folgende Patterns (case-insensitive) aus `raw_name`:
  | Pattern-Beispiel | normalized_amount | normalized_unit |
  |-----------------|-------------------|-----------------|
  | `250G`, `250 G`, `250GR`, `250 GR` | 250 | g |
  | `1KG`, `0.5KG`, `0,5KG`, `500G` | 1000 / 500 / 500 / 500 | g |
  | `1L`, `1 L`, `1LT`, `1 LT` | 1000 | ml |
  | `500ML`, `500 ML` | 500 | ml |
  | `0,5L`, `0.5L` | 500 | ml |
  | `6ST`, `6 ST`, `6STK`, `6 STK`, `6X` | 6 | Stück |
  | `4X250G` | 1000 | g (= 4 × 250g) |
  | `6X1L` | 6000 | ml (= 6 × 1000ml) |
- [ ] Fallback: wenn kein Pattern erkannt → alle drei Felder bleiben `NULL`; kein Fehler, kein Log-Spam
- [ ] `price_per_unit_cents` Berechnung:
  - g/ml: `Math.round(unit_price_cents / normalized_amount * 100)` (→ €/100g oder €/100ml)
  - Stück: `Math.round(unit_price_cents / normalized_amount)` (→ €/Stück)
- [ ] Dezimaltrennzeichen: Komma (`0,5`) und Punkt (`0.5`) werden beide korrekt geparst
- [ ] Unit-Tests für alle Pattern-Beispiele oben + Edge Cases

### Integration beim Import
- [ ] Nach dem Parsen jedes `receipt_item` wird `parseUnit(raw_name)` aufgerufen und die drei Felder gesetzt
- [ ] Gilt für alle Import-Routen: eBon-Import, Paperless-Sync, Bestellung-Import

### Backfill
- [ ] API-Endpunkt `POST /api/admin/backfill-units` (oder Button in `/einstellungen`) führt Normalisierung für alle bestehenden `receipt_items` durch
- [ ] Zeigt Fortschritt oder Bestätigung ("X von Y Items normalisiert")

### UI — Produktliste
- [ ] Neue optionale Spalte "€/Einheit" in `product-list.tsx`
- [ ] Zeigt `price_per_unit_cents` des letzten Kaufs mit Einheit: z.B. "0,84 €/100g", "1,23 €/100ml", "0,45 €/Stück"
- [ ] Spalte nur sichtbar wenn mindestens 1 Produkt normalisierte Daten hat
- [ ] Spalte standardmäßig ausgeblendet; einblendbar via Spalten-Toggle (falls vorhanden) oder immer sichtbar — nach Implementierungspräferenz

---

## Edge Cases

- **Kein Pattern erkannt:** Felder bleiben NULL; Produkt erscheint ohne €/Einheit-Spalte.
- **Mehrfach-Pack (4X250G):** Gesamtmenge = 4×250 = 1000g; price_per_unit = unit_price / 10 (→ €/100g).
- **Komma-Dezimaltrennzeichen:** "0,5L" → 500ml; "1,5KG" → 1500g.
- **Ambiguität "ST":** Wird immer als "Stück" normalisiert.
- **Negativer Preis (Pfand-Rückgabe):** Normalisierung findet statt, aber Darstellung zeigt negativen Wert — kein Fehler.
- **quantity > 1 in receipt_item:** `unit_price_cents` wird verwendet (nicht `total_price_cents`), da es der Einzelpreis ist.

---

## Nicht im Scope
- Automatischer Vergleich zwischen Produkten verschiedener Marken (→ PROJ-41)
- Multi-Store-Preisvergleich nach €/Einheit (→ PROJ-43)
- UI-Chart für €/Einheit-Entwicklung (kann als Erweiterung von PROJ-4 folgen)
- Normalisierung von Nicht-REWE-Bons (PROJ-23 Lidl/Kaufland): Best-Effort; kein Fehler wenn Pattern nicht passt
