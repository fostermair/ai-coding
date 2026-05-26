# PROJ-32: Bestellbestätigung-Import & Produktmengen-Verknüpfung

## Status: Deployed

---

## Summary

Bestellbestätigungen von REWE Online-Bestellungen werden geparst und mit AVIS sowie eBon verknüpft. Die extrahierten Artikelnamen und Mengenangaben werden in der Bon-Detailansicht angezeigt, ermöglichen die Berechnung von Preis pro 100g/100ml und verfügbar gemacht über einen neuen PDF-Reiter.

---

## User Stories

### US-1: Bestellbestätigung manuell hochladen
Als Nutzer möchte ich eine Bestellbestätigungs-PDF über einen eigenen Import-Bereich hochladen können, damit die Artikelnamen und Mengenangaben gespeichert werden.

**Akzeptanzkriterien:**
- AC-1.1: Eigener Upload-Bereich „Bestellbestätigung" in der Import-UI
- AC-1.2: PDF wird geparst; extrahiert werden: Bestellnummer, Artikelname, Mengenwert (z. B. 500), Mengeneinheit (g, kg, ml, l, Stück, Packung), Einzelpreis
- AC-1.3: Duplikat-Schutz: gleiche Bestellnummer kann nicht zweimal importiert werden
- AC-1.4: Import-Status wird im `import_log` mit Eintrag `[BESTELLUNG] {orderNumber}` gespeichert

### US-2: Paperless-ngx automatische Synchronisation
Als Nutzer möchte ich, dass Bestellbestätigungen aus Paperless-ngx automatisch synchronisiert werden, wenn ich einen eigenen Dokumententyp oder Tag für Bestellbestätigungen in Paperless angelegt habe.

**Akzeptanzkriterien:**
- AC-2.1: Neuer Sync-Endpunkt `POST /api/paperless/bestellung-sync` analog zu `/api/paperless/avis-sync`
- AC-2.2: Filterung über eigene Env-Variablen: `PAPERLESS_BESTELLUNG_TAG`, `PAPERLESS_BESTELLUNG_CORRESPONDENT_ID`, `PAPERLESS_BESTELLUNG_DOCUMENT_TYPE_ID`
- AC-2.3: Sync-Button in der Import-UI für Bestellbestätigungen, der diesen Endpunkt aufruft
- AC-2.4: Dokumenten-ID aus Paperless wird in `import_log.paperless_doc_id` gespeichert

### US-3: Bestellbestätigung als eigener Reiter in der Bon-Detailansicht
Als Nutzer möchte ich die Bestellbestätigungs-PDF direkt in der Bon-Detailansicht in einem eigenen Reiter „Bestellung" ansehen können.

**Akzeptanzkriterien:**
- AC-3.1: Neuer Tab „Bestellung" neben den bestehenden Tabs „Produkte", „EBon", „AVIS"
- AC-3.2: Tab ist nur aktiv (nicht disabled), wenn Bestelldaten für diesen Bon vorhanden sind
- AC-3.3: PDF-Anzeige als iframe, analog zum eBon- und AVIS-Tab, über Endpunkt `/api/bons/{id}/bestellung-pdf`
- AC-3.4: Bei Paperless-Import: PDF wird über Paperless-API (`PAPERLESS_URL`) geladen
- AC-3.5: Bei manuellem Upload: PDF wird lokal unter `data/bestellungen/` gespeichert; Pfad in `import_log.pdf_path` hinterlegt

### US-4: Bestellartikelname & Menge in Bon-Detailansicht
Als Nutzer möchte ich in der Bon-Detailansicht pro Artikel den Bestellartikelnamen und die Menge sehen.

**Akzeptanzkriterien:**
- AC-4.1: Neue Spalte „Bestellartikel" in der Produkttabelle des Bon-Details zeigt den Artikelnamen aus der Bestellbestätigung
- AC-4.2: Neue Spalte „Menge" zeigt Mengenwert + Einheit (z. B. „500 g")
- AC-4.3: Beide Spalten sind nur sichtbar, wenn Bestelldaten für diesen Bon vorhanden sind
- AC-4.4: Verknüpfung läuft über die Kette: order_number → import_log → avis_matches → receipt_item

### US-5: Preis pro 100 g / 100 ml
Als Nutzer möchte ich den errechneten Preis pro 100 g (oder 100 ml) sehen, um Produkte wertmäßig zu vergleichen.

**Akzeptanzkriterien:**
- AC-5.1: Wenn Einheit `g` oder `ml`: Preis/100g bzw. Preis/100ml wird berechnet und angezeigt
- AC-5.2: Wenn Einheit `kg` oder `l`: automatische Umrechnung (÷10 für /100g)
- AC-5.3: Wenn keine Gewichtsangabe (Stück, Packung): Spalte zeigt „–"
- AC-5.4: Berechnung basiert auf `unit_price_cents` aus dem eBon (nicht dem Bestellpreis)

---

## Dependencies

- Requires PROJ-19 (AVIS-Import) – `avis_matches` und `import_log` müssen existieren
- Requires PROJ-20 (AVIS-Bon-Review) – `bon-detail.tsx` ist die Zielkomponente

---

## Edge Cases

- **Kein AVIS zur Bestellnummer vorhanden:** Bestelldaten werden gespeichert; Verknüpfung erfolgt automatisch, wenn AVIS später importiert wird
- **Artikel in Bestellung, aber nicht im eBon** (nicht geliefert): `avis_matches.status='unmatched'` – trotzdem in `bestellung_items` gespeichert
- **Mengenformat-Varianten:** „500g", „0,5 kg", „6x330ml", „1 Stück" – Parser normalisiert auf `quantity_amount` + `quantity_unit`
- **Mehrere Bons zur selben Bestellung** (Teillieferungen): Bestelldaten erscheinen in allen verknüpften Bons

---

## Implementation Notes

### Data Model

#### New table: `bestellung_items`
```sql
CREATE TABLE bestellung_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  import_log_id     INTEGER REFERENCES import_log(id),
  order_number      TEXT NOT NULL,
  article_name      TEXT NOT NULL,
  quantity_amount   REAL,
  quantity_unit     TEXT,   -- 'g', 'kg', 'ml', 'l', 'Stück', 'Packung', ...
  unit_price_cents  INTEGER,
  total_price_cents INTEGER,
  created_at        TEXT DEFAULT (datetime('now'))
)
```

#### New column in `import_log`: `pdf_path`
```sql
ALTER TABLE import_log ADD COLUMN pdf_path TEXT;
```

### Files to Create/Modify

| File | Action | Notes |
|------|--------|-------|
| `src/lib/parser/bestellung.ts` | CREATE | PDF-Parser für Bestellbestätigung |
| `src/lib/db.ts` | MODIFY | Tabelle + Migration |
| `src/app/api/bestellung/import/route.ts` | CREATE | Manueller Upload |
| `src/app/api/paperless/bestellung-sync/route.ts` | CREATE | Paperless-Sync |
| `src/app/api/bons/[id]/bestellung-pdf/route.ts` | CREATE | PDF-Serving (Paperless oder lokal) |
| `src/app/api/bon/[id]/items/route.ts` | MODIFY | Bestelldaten per JOIN anfügen |
| `src/components/bon-detail.tsx` | MODIFY | neuer Tab + Spalten |
| Import-UI | MODIFY | Upload-Bereich + Sync-Button |
| `.env.local.example` | MODIFY | neue Env-Vars |

### Environment Variables

```env
PAPERLESS_BESTELLUNG_TAG=<tag-id>
PAPERLESS_BESTELLUNG_CORRESPONDENT_ID=<correspondent-id>
PAPERLESS_BESTELLUNG_DOCUMENT_TYPE_ID=<document-type-id>
```

---

## Testing Plan

1. Manuelle Upload-Tests
   - `data/bestellung/` PDF über UI hochladen
   - Duplikat-Import ablehnen
   - `bestellung_items` in DB verifizieren

2. Bon-Detail-Anzeige
   - Spalten „Bestellartikel", „Menge", „Preis/100g" prüfen
   - Tab „Bestellung" öffnen, PDF anzeigen
   - Verknüpfung über order_number verifizieren

3. Paperless-Integration
   - Env-Vars setzen
   - Sync-Button klicken
   - Dokument in DB + Bon-Detail prüfen

4. Berechnungen
   - Preis/100g für verschiedene Einheiten (g, kg, ml, l)
   - Keine Berechnung für Stück/Packung (zeigt „–")

---

## Version History

| Date | Status | Notes |
|------|--------|-------|
| 2026-05-26 | Deployed | All AC met; API route + UI components deployed; deletion feature added to config menu |
| 2026-05-26 | Planned | Spec created |
