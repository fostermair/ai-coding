# PROJ-21: Manuelle AVIS-Zuweisung für nicht gematchte Artikel

**Status:** In Progress  
**Created:** 2026-05-20  
**Dependencies:** PROJ-20 (AVIS-Status & Alias-Review in Bon-Ansicht)

## Implementation Notes

### Frontend (Completed)
- Created `src/components/avis-manual-assign-dialog.tsx` - modal dialog with:
  - Searchable list of candidates from the same AVIS
  - Suggestion from global database with similarity score
  - Assign buttons for each candidate + suggestion
- Updated `src/components/bon-detail.tsx`:
  - Added edit button (pencil icon) for rejected/unmatched items
  - Added match source badges ([AVIS] green / [Global] blue)
  - Integrated manual assign dialog with proper state management
  - Extended `AvisMatch` interface with `status: "unmatched"` and `match_source` field
  - Extended `BonDetail` interface with `has_avis: boolean` flag
- TypeScript compilation successful, no build errors

### Backend (Completed)
- ✅ Added `match_source` column to `avis_matches` table via migration
- ✅ Extracted fuzzy matching utilities to `src/lib/avis-matching.ts` for reuse
- ✅ Modified import route to save AVIS items with confidence < 60% as status='unmatched'
- ✅ Implemented 3 new API endpoints:
  - `GET /api/avis/matches/candidates?receipt_id=X` - returns all AVIS items for a receipt with assignment info
  - `GET /api/avis/suggestions?raw_name=X` - returns best fuzzy match from global database
  - `POST /api/avis/matches/manual-assign` - saves manual assignment with match_source tracking
- ✅ Updated `GET /api/bons/[id]` to include `match_source` field and `has_avis` flag
- ✅ All existing AVIS tests pass, build succeeds with no errors

---

## Problem Statement

In der Bon-Detailansicht gibt es Artikel, denen kein AVIS-Match zugeordnet wurde – entweder weil die Konfidenz zu niedrig war (< 60 %) oder weil der User einen Match manuell abgelehnt hat. Bisher gibt es keine Möglichkeit, diese Artikel nachträglich manuell einem AVIS-Namen zuzuordnen. Zusätzlich gehen AVIS-Positionen mit Konfidenz < 60 % beim Import komplett verloren und stehen für spätere Auswertungen nicht zur Verfügung.

---

## User Stories

1. **Als User** möchte ich bei nicht gematchten Artikeln in der Bon-Detailansicht einen Edit-Button sehen, damit ich eine manuelle Zuweisung vornehmen kann.

2. **Als User** möchte ich im Dialog alle AVIS-Positionen der zugehörigen AVIS-Rechnung sehen, damit ich den richtigen Eintrag auswählen kann.

3. **Als User** möchte ich einen alternativen Namensvorschlag aus der gesamten AVIS-Datenbank erhalten, damit ich auch dann eine Zuweisung vornehmen kann, wenn der passende Name nicht in der zugehörigen AVIS ist.

4. **Als User** möchte ich nach der Zuweisung visuell erkennen können, ob ein Match aus der zugehörigen AVIS oder aus der Gesamtdatenbank stammt, damit ich Fehlzuweisungen schnell entdecken kann.

5. **Als User** möchte ich, dass beim AVIS-Import auch schwache Matches (Konfidenz < 60 %) gespeichert werden, damit diese als Auswahloptionen im Dialog verfügbar sind.

---

## Acceptance Criteria

### AC-1: Edit-Button anzeigen
- [ ] Für Artikel mit `avis_match.status === 'rejected'` wird ein Stift-Icon-Button angezeigt (neben dem `(kein Match)`-Label).
- [ ] Für Artikel ohne jedes `avis_match`-Eintrag wird ebenfalls ein Stift-Icon-Button angezeigt, sofern für diesen Bon eine AVIS vorhanden ist.
- [ ] Artikel mit `status === 'confirmed'`, `'auto_set'` oder `'pending'` zeigen keinen Edit-Button.

### AC-2: Dialog öffnen
- [ ] Klick auf den Edit-Button öffnet einen modalen Dialog.
- [ ] Der Dialog zeigt den Artikel-Rohnamen als Kontext oben an.

### AC-3: AVIS-Positionen aus zugehöriger AVIS
- [ ] Der Dialog zeigt alle `avis_item_name`-Werte aus `avis_matches` für diese `receipt_id` (alle Status-Werte inkl. `'unmatched'`).
- [ ] Die Liste ist scrollbar und durchsuchbar (Textfilter).
- [ ] Bereits bestätigte oder anderweitig verwendete AVIS-Positionen werden als solche markiert (grau/disabled oder mit Label), können aber trotzdem ausgewählt werden.

### AC-4: Vorschlag aus Gesamtdatenbank
- [ ] Der Dialog zeigt einen Vorschlag-Bereich: den besten Fuzzy-Match des Artikel-Rohnamens gegen alle `avis_item_name`-Werte in der gesamten `avis_matches`-Tabelle.
- [ ] Der Vorschlag zeigt den Namen und einen "Übernehmen"-Button.
- [ ] Wenn kein sinnvoller Vorschlag gefunden wird (Score < Schwellwert), wird der Bereich ausgeblendet oder als "Kein Vorschlag verfügbar" dargestellt.

### AC-5: Zuweisung speichern
- [ ] Nach Auswahl und Bestätigung wird ein neuer `avis_matches`-Eintrag erstellt (oder der bestehende aktualisiert) mit `status = 'confirmed'`.
- [ ] Das Feld `match_source` wird gesetzt: `'avis_document'` wenn aus der zugehörigen AVIS gewählt, `'global_database'` wenn aus dem Gesamtdatenbank-Vorschlag.
- [ ] Der `product_aliases`-Eintrag wird angelegt/aktualisiert.
- [ ] Die Bon-Detailansicht aktualisiert sich nach dem Speichern (kein Full-Page-Reload nötig).

### AC-6: Quelle visualisieren
- [ ] Bestätigte Matches mit `match_source = 'avis_document'` zeigen ein grünes "AVIS"-Badge neben dem Checkmark.
- [ ] Bestätigte Matches mit `match_source = 'global_database'` zeigen ein blaues "Global"-Badge.
- [ ] Bestätigte Matches ohne `match_source` (auto_set) zeigen weiterhin nur den grünen Checkmark (kein Badge).

### AC-7: Import speichert alle AVIS-Positionen
- [ ] Beim AVIS-Import werden auch AVIS-Positionen mit Konfidenz < 60 % in `avis_matches` gespeichert, mit `status = 'unmatched'` und `receipt_item_id = NULL`.
- [ ] Diese Einträge erscheinen in der Kandidatenliste des Dialogs.

---

## Edge Cases

- **Keine AVIS für diesen Bon:** Edit-Button wird nicht angezeigt. Die Bon-Detailansicht prüft, ob für die `receipt_id` AVIS-Matches existieren.
- **AVIS-Liste leer (alle < 60 %, kein Import gespeichert bei alten Daten):** Dialog zeigt nur den Gesamtdatenbank-Vorschlag; AVIS-Sektion zeigt eine leere Meldung.
- **Mehrere AVIS-Dokumente für denselben Bon:** Alle `avis_item_name`-Werte aller zugehörigen `avis_matches` werden angezeigt, gruppiert nach `import_log_id`.
- **Gleicher AVIS-Name in mehreren Positionen:** User kann trotzdem denselben Namen mehrfach auswählen (verschiedene Artikel auf einem Bon können denselben AVIS-Namen haben, z. B. mehrfach gekaufte Artikel).
- **Nachträgliche Zuweisung überschreibt bestehenden Rejected-Match:** Der bestehende `avis_matches`-Eintrag wird auf `status = 'confirmed'` gesetzt.
- **Kein Fuzzy-Match-Vorschlag gefunden:** Vorschlag-Sektion wird mit Meldung "Kein Vorschlag verfügbar" angezeigt, aber ausgeblendet.

---

## Database Changes

### `avis_matches` Tabelle: Neue Spalte
```sql
ALTER TABLE avis_matches ADD COLUMN match_source TEXT;
-- Werte: 'avis_document' | 'global_database' | NULL (für auto_set/pending/rejected)
```

### Neuer Status `'unmatched'`
- Bestehende Status-Werte: `pending`, `confirmed`, `rejected`, `auto_set`
- Neu: `unmatched` – AVIS-Position mit Konfidenz < 60 %, nicht einem Artikel zugeordnet

---

## UI Sketch

```
┌─────────────────────────────────────────────────────────────────┐
│ AVIS-Name manuell zuweisen                              [X]      │
│─────────────────────────────────────────────────────────────────│
│ Artikel: TILSIT JUNG 500G                                        │
│                                                                  │
│ Aus dieser AVIS (3 Positionen)              [Suche filtern...]   │
│ ○ TILSITER JUNG 500G                                             │
│ ○ BUTTERKÄSE MILD 400G                                           │
│ ○ EDAMER JUNG SCHEIBEN (bereits zugeordnet zu: "Artikel XY")     │
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │
│ Vorschlag aus Gesamtdatenbank                                    │
│ ✦ TILSITER JUNG 500G (Score: 94 %)          [Übernehmen]        │
│                                                                  │
│                              [Abbrechen]  [Zuweisen]            │
└─────────────────────────────────────────────────────────────────┘
```

### Visualisierung in der Bon-Detailansicht nach Zuweisung

| Status | Produkt-Zelle | AVIS-Spalte |
|--------|--------------|-------------|
| auto_set | ✓ Alias-Name | ✓ |
| confirmed (avis_document) | ✓ Alias-Name | ✓ [AVIS] |
| confirmed (global_database) | ✓ Alias-Name | ✓ [Global] |
| pending | Roh-Name | (pending row below) |
| rejected | ⊗ Roh-Name (kein Match) | ✏️ |
| kein Match | Roh-Name | ✏️ |

---

## New API Endpoints

| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/avis/matches/candidates?receipt_id=X` | Alle AVIS-Positionen für einen Bon (alle Status) |
| GET | `/api/avis/suggestions?raw_name=X` | Bester Fuzzy-Match aus gesamter AVIS-DB |
| POST | `/api/avis/matches/manual-assign` | Manuelle Zuweisung speichern |

---

## Out of Scope
- Bulk-Zuweisung für mehrere Artikel gleichzeitig
- Zuweisung aus einem anderen Bon (nur diese AVIS und Gesamtdatenbank)
- Retroaktive Migration alter Daten (pre-PROJ-21 Importe ohne `unmatched`-Einträge)
