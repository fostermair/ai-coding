# PROJ-29: Kontoauszug-PDF-Toggle in Transaktionsansicht

## Status: Approved
## Created: 2026-05-24
## Revised: 2026-05-24

## Dependencies
- PROJ-24 (Kontoauszug-Import) — `bank_transactions.periode` (YYYY-MM) und `bank_statement_log` bereits vorhanden
- PROJ-25 (Bon-Kontoauszug Abgleich) — Transaktionsansicht bereits implementiert

---

## Problem / Motivation

Nutzer der Transaktionsansicht möchten die Original-Kontoauszug-PDFs direkt in der App einsehen, um Bank­buchungen zu verifyzeigen, ohne zwischen Anwendung und externem PDF-Viewer zu wechseln. Die ursprüngliche Idee mit Jahr-/Monats-Dropdowns war nicht benutzerfreundlich. Stattdessen: direkter PDF-Toggle pro Kontoauszug-Gruppe.

---

## User Stories

### US-1: PDF-Inline-Viewer für Kontoauszüge
**Als** Nutzer der Transaktionsansicht  
**möchte ich** auf einen Button im Accordion-Header klicken und das PDF des Kontoauszugs inline sehen  
**damit** ich Bankbuchungen verifizieren kann ohne die App zu verlassen.

**Akzeptanzkriterien:**
- [ ] Im aufgeklappten Accordion-Header (rechts neben dem Gesamtbetrag) erscheint ein PDF-Icon-Button
- [ ] Der Button ist nur sichtbar, wenn ein Paperless-synchronisierter Kontoauszug vorhanden ist
- [ ] Klick auf den Button zeigt ein `<iframe>` mit dem Original-PDF (600px Höhe)
- [ ] Während das PDF lädt, wird ein Ladezustand angezeigt
- [ ] Die Transaktionstabelle wird durch das PDF ersetzt (Toggle-Behavior)

### US-2: Wechsel zwischen Tabelle und PDF
**Als** Nutzer  
**möchte ich** zwischen Transaktionstabelle und PDF-Ansicht wechseln können  
**damit** ich flexibel vergleichen kann.

**Akzeptanzkriterien:**
- [ ] Ein zweiter Klick auf den PDF-Button zeigt die Transaktionstabelle wieder
- [ ] Der Toggle-Status wird bei Accordion-Collapse gelöscht (neues Öffnen zeigt immer Tabelle)
- [ ] Klick auf den PDF-Button verhindert das Collapse der Gruppe (Event-Propagation)

---

## Scope / Out of Scope

**In Scope:**
- PDF-Toggle-Button in Accordion-Header (nur für Paperless-Statements)
- Inline-iframe mit Kontoauszug-PDF (`/api/konto/statements/[periode]/pdf`)
- PDF-Proxy-API-Route (Paperless-Integration, ähnlich PROJ-28)
- `paperless_doc_id` zu `bank_statement_log` hinzufügen und bei Sync speichern
- Entfernung der Jahres-/Monats-Dropdown-Filter (ursprüngliche PROJ-29 Implementierung)

**Out of Scope:**
- Download-Button für PDFs (nur Inline-Ansicht)
- Kontoauszug-Vergleich zwischen Perioden
- PDF-Annotation oder -Bearbeitung

---

## Edge Cases

- Kontoauszug ohne Paperless-Sync (alte Importe): Button wird nicht angezeigt
- Paperless unerreichbar: iframe zeigt Fehler (404/502) — ausreichend für v1
- PDF zu groß: Browser handhelt (kein kundenspezifisches Loading-Handling nötig)
- Gruppe wird zugeklappt während PDF aktiv: Toggle-State wird gelöscht

---

## UI-Verhalten

```
▼ Mai 2026  ·  Konto_202605.pdf  ·  3 Buchungen  ·  -142,80 €  [📄]

├─ [PDF-iframe wird angezeigt (statt Tabelle)]
```

Nach zweitem Klick auf [📄]:
```
▼ Mai 2026  ·  Konto_202605.pdf  ·  3 Buchungen  ·  -142,80 €  [📄]

├─ [Transaktionstabelle ist wieder sichtbar]
```

---

## Komponenten-Hinweise

- PDF-Button: `FileText` Icon aus lucide-react, nur wenn `kontoauszug_datei?.startsWith('[paperless]')`
- Toggle-State: `pdfGroups: Set<string>` in `transaction-list.tsx`
- iframe-URL: `/api/konto/statements/${group.periode}/pdf`
- iframe-Style: `w-full h-[600px] border-0` (responsive, nicht scrollbar)
- Proxy-Route folgt Muster von `src/app/api/bons/[id]/pdf/route.ts`
