# PROJ-22: Context Map (Konfigurations-Menü)

**Zielgruppe:** Frontend Developer & Backend Developer  
**Nutzen:** Alle relevanten Dateien + Typen sind hier dokumentiert — kein eigenständiges Scanning nötig.

---

## 🗂️ Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/nav.tsx` | Erweitern | Settings-Button hinzufügen (rechts) + Dialog-State |
| `src/components/config-dialog.tsx` | NEU erstellen | Hauptdialog mit AVIS-Lösch- und Alias-Lösch-Buttons |
| `src/app/api/avis/db/route.ts` | NEU erstellen | DELETE-Endpoint: löscht AVIS-Datenbank |
| `src/app/api/produkte/aliases/bulk/route.ts` | NEU erstellen | DELETE-Endpoint: löscht alle Alias |
| `src/lib/db.ts` | Nur lesen | DB-Zugriff; Reference für getDb() Funktion |
| `src/components/ui/dialog.tsx` | Nur lesen | shadcn/ui Dialog-Komponente (existiert bereits) |
| `src/components/ui/alert-dialog.tsx` | Nur lesen | shadcn/ui AlertDialog-Komponente (existiert bereits) |

---

## 📋 Kritische Typen & Interfaces

### API Response Format

```typescript
// DELETE /api/avis/db Response
{
  success: boolean
  count: number          // Anzahl gelöschter Import-Logs
  message: string        // z.B. "12 AVIS Importe gelöscht"
}

// DELETE /api/produkte/aliases/bulk Response
{
  success: boolean
  count: number          // Anzahl gelöschter Alias-Einträge
  message: string        // z.B. "45 Alias gelöscht"
}

// Error Response (both endpoints)
{
  success: false
  message: string        // z.B. "Fehler beim Löschen aufgetreten"
}
```

### Frontend State (config-dialog.tsx)

```typescript
// Dialog & Confirmation State
const [configDialogOpen, setConfigDialogOpen] = useState(false)
const [deleteAvisConfirm, setDeleteAvisConfirm] = useState(false)
const [deleteAliasConfirm, setDeleteAliasConfirm] = useState(false)

// Loading & Feedback
const [avisLoading, setAvisLoading] = useState(false)
const [aliasLoading, setAliasLoading] = useState(false)
const [message, setMessage] = useState<{
  type: 'success' | 'error'
  text: string
} | null>(null)
```

### Database Query Patterns (Backend)

**Tabelle: import_log**
- Spalten: `id`, `filename`, `status`, `message`, `created_at`
- Filter für AVIS: `filename LIKE '[AVIS]%'`

**Tabelle: avis_matches**
- Spalten: `id`, `receipt_id`, `import_log_id`, `avis_item_name`, `status`, `match_source`
- Löschen nur Einträge, deren `import_log_id` in den gelöschten AVIS-Logs ist

**Tabelle: product_aliases**
- Spalten: `raw_name`, `alias`, `updated_at`
- Löschen: Alle Einträge (keine Bedingung)

---

## 🚫 Nicht-lesen-Liste

Diese Dateien sind **NICHT** relevant für diese Feature:

- `/src/app/` (außer `api/avis/db/` und `api/produkte/aliases/bulk/`) — andere API-Routes
- `/src/components/product-list.tsx`, `bon-detail.tsx`, etc. — andere Screens
- `/src/lib/parser/` — AVIS-Parser
- `/tests/`, `/cypress/` — E2E-Tests
- `.env` Dateien — keine neuen Secrets nötig

---

## 🧪 Tests

### Bestehende Tests (Read + Regression Check)

| Test-Datei | Was zu prüfen | Aktion |
|---|---|---|
| Keine direkt betroffenen Tests | — | Keine Anpassungen |

**Grund:** Diese Feature ruft nur neue Endpoints auf; bestehende APIs werden nicht geändert.

### Neue Tests (Create)

| Datei | Typ | Beschreibung |
|---|---|---|
| `src/app/api/avis/db/route.test.ts` | Unit | DELETE /api/avis/db: Lösche nur [AVIS]%-Einträge, nicht andere Imports |
| `src/app/api/avis/db/route.test.ts` | Unit | Teste Edge Case: leere DB → 0 Imports gelöscht |
| `src/app/api/avis/db/route.test.ts` | Unit | Teste Error-Handling: DB-Fehler → 500 Response |
| `src/app/api/produkte/aliases/bulk/route.test.ts` | Unit | DELETE /api/produkte/aliases: Lösche alle Einträge |
| `src/app/api/produkte/aliases/bulk/route.test.ts` | Unit | Teste Edge Case: leere Alias-Tabelle → 0 gelöscht |
| `src/components/config-dialog.test.tsx` | Unit | ConfigDialog renders mit zwei Buttons |
| `src/components/config-dialog.test.tsx` | Unit | Klick auf "AVIS löschen" → ConfirmDialog öffnet |
| `src/components/config-dialog.test.tsx` | Unit | Klick auf "Ja, löschen" → API-Call an /api/avis/db |
| `src/components/config-dialog.test.tsx` | Unit | Success-Message zeigt count + message |
| `tests/config-e2e.spec.ts` | E2E | Settings-Button → Dialog → AVIS löschen → Success |

---

## 🔧 Frontend Checklist

- [ ] Settings-Button in `nav.tsx` (rechts, mit Zahnrad-Icon)
- [ ] ConfigDialog-Komponente erstellen
- [ ] ConfirmDialog für AVIS-Löschung
- [ ] ConfirmDialog für Alias-Löschung
- [ ] Fehlerbehandlung + Message-Anzeige
- [ ] Auto-Dismiss Success-Message (3-5 sec)
- [ ] Styling: Buttons mit Warnfarbe (rot) für Lösch-Buttons

## 🔧 Backend Checklist

- [ ] DELETE `/api/avis/db` implementieren
  - Finde alle `import_log` mit `filename LIKE '[AVIS]%'`
  - Lösche zugehörige `avis_matches`
  - Lösche Alias-Einträge ohne match_source (auto_set only)
  - Lösche `import_log` Einträge
  - Gebe count + message zurück
- [ ] DELETE `/api/produkte/aliases/bulk` implementieren
  - Lösche alle `product_aliases` Einträge
  - Gebe count + message zurück
- [ ] Error-Handling für beide Endpoints
- [ ] Tests schreiben (siehe Test-Tabelle oben)

---

## 📌 Navigation & Settings-Button

**Änderung in `nav.tsx`:**

Aktuelle Struktur:
```
[Logo] [Links] [empty space right]
```

Nach Änderung:
```
[Logo] [Links] [Settings Icon Button]
```

Settings-Button rechts positionieren mit `ml-auto` (margin-left: auto).

---

## 🔗 Feature Dependencies

- Keine! Standalone Feature
- Nutzt bestehende UI-Komponenten (Dialog, AlertDialog, Button)
- Nutzt bestehende DB-Tabellen

---

## ✅ Approval Checklist

- [x] Spec gelesen und verstanden
- [x] Codebase gescannt (Komponenten, APIs, DB)
- [x] Dateien dokumentiert (relevante + nicht-lesen)
- [x] Kritische Typen aufgelistet
- [x] Test-Strategie definiert
- [x] Settings-Button Position klar (rechts in Nav)
