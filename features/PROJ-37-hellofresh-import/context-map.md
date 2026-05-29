# Context Map: PROJ-37 — HelloFresh Zahlungsverlauf Import & Tab

**Created:** 2026-05-29
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
/transaktionen (TransactionList)
+-- Tabs (bestehend)
|   +-- Tab: Transaktionen   (bestehend, unberührt)
|   +-- Tab: Statistik        (bestehend, unberührt)
|   +-- Tab: Kategorien       (bestehend, unberührt)
|   +-- Tab: HelloFresh       (NEU)
|       +-- HelloFreshTransactionList (neue Komponente)
|           +-- Summary-Leiste (Card mit 3 Stats: Anzahl, Gesamt, Ø pro Box)
|           +-- Table (Datum | Produkt | Portionen | Personen | Grundpreis | Rabatt | HF Cash | Gesamt | Status)
|           +-- Empty State (wenn keine Daten, Link zur Import-Seite)

/import (ImportTabs)
+-- Tabs (bestehend)
|   +-- Tab: Import           (bestehend)
|   +-- Tab: Bestellungen     (bestehend)
|   +-- Tab: AVIS             (bestehend)
|   +-- Tab: eBons            (bestehend)
|   +-- Tab: Kontoauszüge     (bestehend)
|   +-- Tab: HelloFresh       (NEU)
|       +-- HelloFreshImportPanel (neue Komponente)
|           +-- Button "Zahlungsverlauf importieren"
|           +-- Ergebnis-Anzeige (X importiert, Y aktualisiert)
|           +-- Fehler-Anzeige (Datei nicht gefunden etc.)
```

### Data Model

Neue SQLite-Tabelle: `hellofresh_transactions`

```
hellofresh_transactions:
- id:              INTEGER, Primary Key, auto-increment
- bestellnummer:   TEXT, einzigartig (UNIQUE) — Deduplizierungsschlüssel
- datum:           TEXT ("DD.MM.YYYY" → gespeichert als ISO "YYYY-MM-DD")
- produkt:         TEXT (z. B. "Classic Box", "Feinschmecker Gericht")
- portionen:       INTEGER NULLABLE (null für Extras ohne Portionen)
- personen:        INTEGER NULLABLE
- grundpreis_cents: INTEGER (Euro → Cents, z. B. 87,00 € → 8700)
- liefergebuehren_cents: INTEGER
- rabatt_cents:    INTEGER (negativ gespeichert, z. B. -3480)
- hf_cash_cents:   INTEGER (HelloFresh Cash, meist 0 oder negativ)
- gesamt_cents:    INTEGER
- status:          TEXT ("Bezahlt" | "Erstattet")
- importiert_am:   TEXT, Default: datetime('now')

Eindeutigkeitsindex auf bestellnummer.
Import per UPSERT (INSERT OR REPLACE / ON CONFLICT(bestellnummer) DO UPDATE SET ...).
```

Alle Geldbeträge werden als Ganzzahl in Cent gespeichert, um Floating-Point-Fehler zu vermeiden (identisch zum restlichen DB-Schema).

### Tech Decisions

**Warum serverseitiges Einlesen der JSON-Datei statt Upload?**
Die Datei liegt bereits lokal auf dem Server unter `data/hellofresh/`. Ein File-Upload wäre unnötiger Aufwand. Die Import-API liest einfach den bekannten Pfad aus.

**Warum UPSERT statt Insert?**
Der Nutzer kann den Import mehrfach ausführen (z. B. wenn die JSON-Datei aktualisiert wurde). UPSERT auf `bestellnummer` verhindert Duplikate und aktualisiert geänderte Felder.

**Warum Beträge in Cents?**
Konsistent mit dem restlichen Schema (`betrag_cents`, `total_amount_cents` etc.). Verhindert Rundungsfehler bei Summenbildung.

**Warum Tab in TransactionList statt eigener Seite?**
Der Nutzer hat explizit „unter Transaktionen in einem eigenen Tab" angefragt. Die bestehende `TransactionList` hat bereits eine Tabs-Struktur mit 3 Tabs — das HelloFresh-Tab wird als 4. Tab dort eingefügt.

### Dependencies (packages to install)

Keine neuen Pakete erforderlich. `better-sqlite3` und alle UI-Komponenten sind bereits installiert.

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** the files listed below.
> Do NOT scan the codebase independently.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | Neue `hellofresh_transactions`-Tabelle als Migration hinzufügen |
| `src/app/api/hellofresh/import/route.ts` | Neu erstellen | POST — liest JSON aus `data/hellofresh/`, UPSERT in DB |
| `src/app/api/hellofresh/transactions/route.ts` | Neu erstellen | GET — gibt alle Einträge zurück, sortiert nach datum DESC |
| `src/components/hellofresh-transaction-list.tsx` | Neu erstellen | Tab-Inhalt: Summary-Karten + Tabelle |
| `src/components/hellofresh-import-panel.tsx` | Neu erstellen | Import-Button + Ergebnis-/Fehleranzeige für Import-Seite |
| `src/components/transaction-list.tsx` | Erweitern | 4. Tab „HelloFresh" + `<HelloFreshTransactionList />` einfügen |
| `src/components/import-tabs.tsx` | Erweitern | 6. Tab „HelloFresh" + `<HelloFreshImportPanel />` einfügen |
| `src/lib/format.ts` | Nur lesen | `formatEuro`, `formatDate` — für Darstellung in der Tabelle |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// Typ für einen HelloFresh-Eintrag (aus API-Response)
interface HelloFreshTransaction {
  id: number
  bestellnummer: string
  datum: string              // ISO: "YYYY-MM-DD"
  produkt: string
  portionen: number | null
  personen: number | null
  grundpreis_cents: number
  liefergebuehren_cents: number
  rabatt_cents: number       // negativ, z. B. -3480
  hf_cash_cents: number      // negativ oder 0
  gesamt_cents: number
  status: "Bezahlt" | "Erstattet"
  importiert_am: string
}

// API-Response für Import (POST /api/hellofresh/import)
interface HelloFreshImportResult {
  imported: number    // neu eingefügte Einträge
  updated: number     // aktualisierte Einträge (bestellnummer bekannt)
  total: number       // imported + updated
}

// Bestehender Tab-Wert-Typ in TransactionList (Zeile 343):
// defaultValue="transaktionen" → neue Option: "hellofresh"
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/api/konto/` — Kontoauszug-Logik, unberührt
- `src/app/api/bons/` — eBon-Logik, unberührt
- `src/app/api/avis/` — AVIS-Logik, unberührt
- `src/app/api/bestellung/` — Bestellung-Logik, unberührt
- `src/app/api/statistiken/` — Statistiken, unberührt
- `src/app/api/produkte/` — Produktdatenbank, unberührt
- `src/components/ui/` — shadcn-Komponenten, keine Änderung
- `src/components/bon-*.tsx` — Bon-Ansichten, unberührt
- `src/components/avis-*.tsx` — AVIS-Dialoge, unberührt

---

## Tests

> QA liest und schreibt NUR die hier gelisteten Test-Dateien.

### Bestehende Tests (lesen + ggf. anpassen)

| Datei | Typ | Warum relevant |
|---|---|---|
| `tests/e2e/proj29-transaction-filter.spec.ts` | E2E | Testet TransactionList — Regression prüfen, da wir einen neuen Tab einfügen |

### Neue Tests (erstellen)

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/e2e/proj37-hellofresh-import.spec.ts` | E2E | Ein `test()` pro Acceptance Criterion: Import-Button vorhanden, Tabelle zeigt Daten, leerer State ohne Import, Erstattet-Badge, Beträge korrekt formatiert |
