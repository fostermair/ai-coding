# PROJ-53: Ausgaben-Lebenszyklus-Status

## Status: Approved
## Created: 2026-06-01

## Overview
Pro Ausgabe-Zeile im Ledger wird ein klar lesbarer Lebenszyklus-Status angezeigt, der zeigt, wie vollständig die Ausgabe erfasst ist — abgeleitet aus bereits vorhandenen Datenbankfeldern, ohne neue Spalten.

## Problem
Alle Ausgabe-Zeilen sehen optisch gleich aus, obwohl sie sich fundamental unterscheiden: eine Zeile kann nur ein Kontoauszug-Eintrag sein (kein Produktwissen), ein eBon mit rohen Produktnamen, oder ein vollständig angereicherter Bon mit AVIS/Bestellung. Dieser Unterschied ist aktuell nur über versteckte Icons (€, AVIS, Best.) erkennbar, nicht auf einen Blick kommuniziert. Nutzer verstehen nicht, warum manche Ausgaben in der Produktauswertung fehlen.

## User Stories

**US-1:** Als Nutzer will ich auf einen Blick sehen, ob eine Ausgabe nur als Kontoauszug-Eintrag vorliegt oder ob bereits ein eBon mit Produktdaten verknüpft ist, damit ich weiß, wo noch Daten fehlen.

**US-2:** Als Nutzer will ich verstehen, warum manche Ausgaben noch keine Produktauswertung haben, damit ich gezielt eBons nachimportieren oder AVIS bestätigen kann.

## Acceptance Criteria

- [ ] Jede Ausgabe-Zeile zeigt einen Status-Badge mit einer der 3 Stufen:
  - **„Konto"** (grau) — nur Bank-Transaktion, kein eBon vorhanden (`is_virtual = 1`, `item_count = 0`).
  - **„Beleg"** (blau) — eBon vorhanden mit Artikeln (`is_virtual = 0`, `item_count > 0`), aber ohne AVIS/Bestellung-Verknüpfung.
  - **„Vollständig"** (grün) — eBon vorhanden und AVIS confirmed oder Bestellung verknüpft (`has_bestellung = 1` oder `avis_status = 'complete'`).
- [ ] Der Status wird client-seitig aus den bereits gelieferten Feldern `is_virtual`, `item_count`, `avis_status`, `has_bestellung` abgeleitet — keine neue DB-Spalte nötig.
- [ ] HelloFresh-Zeilen (PROJ-52) zeigen einen eigenen Badge „HelloFresh" (lila/brand-color) statt des 3-stufigen Lebenszyklus.
- [ ] AVIS-Status „pending" zählt nicht als „Vollständig" — Zeile bleibt auf „Beleg".
- [ ] eBon mit `item_count = 0` (Leer-Bon, Sonderfall) zählt als „Konto", nicht „Beleg".
- [ ] Tooltip/Title am Badge erklärt kurz, was der Status bedeutet (z.B. „Kein eBon importiert — nur Kontoauszug vorhanden").
- [ ] Die bestehenden Icons (€-Match, AVIS-Status, Best.-Badge) können neben dem neuen Badge bestehen bleiben oder in ihn integriert werden — Entscheidung im Frontend-Schritt.

## Edge Cases

- Virtuelle Belege ohne bank_match (direkt als virtual angelegt): Status „Konto".
- eBon mit `avis_status = 'no_matches'` (AVIS-Dokument da, aber keine Treffer): Status „Beleg".
- Zukünftige Erweiterung auf 4. Stufe „Kategorisiert" (wenn Produktkategorien vergeben): Out of Scope jetzt, Badge-System aber so gestalten, dass eine 4. Stufe addierbar ist.

## Out of Scope
- Ändern der Matching-Logik oder DB-Schema (rein visuelle Ableitung).
- Aktionsbuttons direkt am Badge (z.B. „eBon importieren") — das ist ein separates UX-Feature.

## Dependencies
- Requires PROJ-52 (Ausgaben-Ledger — definiert die Zeilen, auf denen der Badge erscheint)
- Requires PROJ-20 (AVIS-Status in Bon-Ansicht — liefert `avis_status`)
- Requires PROJ-32 (Bestellung Import — liefert `has_bestellung`)
