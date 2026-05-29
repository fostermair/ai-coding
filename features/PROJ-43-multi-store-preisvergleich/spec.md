# PROJ-43: Multi-Store-Preisvergleich

## Metadata
- **Status:** Approved
- **Created:** 2026-05-29
- **Sprint:** 4
- **Dependencies:** PROJ-39 (Preis-pro-Einheit-Normalisierung), PROJ-23 (Multi-Supermarkt-Import, liefert `store_chain`)

## Problem
Nutzer kaufen dasselbe Produkt (gleicher Alias) bei mehreren Supermärkten zu unterschiedlichen Preisen — ohne dies zu wissen. Die App hat durch PROJ-23 und PROJ-39 die Datenbasis, um diese Vergleiche bereitzustellen, zeigt sie aber nirgends an.

## Ziel
Pro Produkt-Alias: Preis-pro-Einheit nach Kette aggregieren. Neue Ansicht "Multi-Store-Vergleich" in der Analyse-Seite. Sektion in der Produktdetail-Ansicht. Grundlage für PROJ-42 Spar-Alerts.

## User Stories

### US-1: Preisvergleich im Produktdetail sehen
Als Nutzer möchte ich in der Produktdetail-Ansicht sehen, in welchem Supermarkt ich dasselbe Produkt zu welchem Preis gekauft habe, damit ich beim nächsten Einkauf die günstigere Alternative wählen kann.

**Acceptance Criteria:**
- Produktdetail-Seite zeigt neue Sektion "Preisvergleich nach Supermarkt" (nur wenn ≥2 verschiedene `store_chain`-Werte für diesen Alias existieren)
- Tabelle: Kette | Letzter Preis | Preis/Einheit | Letzter Kauf | Δ% zum günstigsten
- Günstigste Kette (nach Preis/Einheit) wird grün hervorgehoben
- Teuerste Kette wird mit Δ% gegenüber der günstigsten angezeigt (z.B. "+31%")
- Wenn `price_per_unit_cents` nicht verfügbar: Fallback auf `unit_price` mit Hinweis "(kein normalisierter Preis)"
- Sektion ist ausgeblendet wenn nur eine Kette vorhanden

### US-2: Multi-Store-Übersicht in der Analyse-Seite
Als Nutzer möchte ich eine Übersichts-Tabelle aller Produkte mit Preisunterschieden zwischen Ketten sehen, sortierbar nach höchster Preisdifferenz, damit ich die besten Spar-Potenziale identifizieren kann.

**Acceptance Criteria:**
- Neuer Tab "Multi-Store" in `/analyse`
- Tabelle zeigt: Produkt-Alias | Günstigste Kette | Teuerste Kette | Δ% Unterschied | Letzte Käufe
- Nur Produkte mit ≥2 Ketten und Kauf in den letzten 6 Monaten (Default-Filter)
- Sortierbar nach Δ% (Default: absteigend — höchste Einsparung zuerst)
- Klick auf Zeile → Produktdetail-Seite
- Bei keinen Multi-Store-Daten: "Kein Multi-Store-Vergleich möglich — bislang nur [Kette]-Bons importiert"

### US-3: Nur echte eigene Käufe vergleichen
Als Nutzer möchte ich nur Vergleiche sehen, bei denen ich das Produkt tatsächlich in mehreren Läden gekauft habe — keine theoretischen Vergleiche gegen externe Preisdatenbanken.

**Acceptance Criteria:**
- Vergleich basiert ausschließlich auf `receipt_items` der importierten Bons
- Kein externer API-Call, keine Online-Preisdatenbank
- Produkte mit identischem `alias` gelten als dasselbe Produkt (kein Fuzzy-Matching über Ketten hinweg)

## Datenmodell
- Quelltabellen: `receipt_items` (mit `store_chain` via JOIN auf `receipts`), `product_aliases`, `price_per_unit_cents`
- Aggregation: `GROUP BY alias, store_chain` → `AVG(price_per_unit_cents)`, `MAX(receipt_date)` als letzter Kauf
- `store_chain`-Wert stammt aus PROJ-23 Parser (z.B. "REWE", "Lidl", "Kaufland")

## Edge Cases
- Nutzer hat nur REWE-Bons → Feature zeigt keinen Inhalt, Hinweis erklärt warum
- Alias unterschiedlich je Kette (Nutzer hat "Butter" bei REWE aber "Markenbutter" bei Lidl) → kein automatischer Match, Nutzer muss Alias angleichen; Hinweis in UI: "Gleiche Produkte aus verschiedenen Ketten müssen denselben Alias haben"
- `price_per_unit_cents` nicht parsierbar → Fallback auf `unit_price` mit Kennzeichnung "(Stückpreis)"
- Letzter Kauf >6 Monate in einer Kette → Kette wird ausgegraut und mit "(veraltet)" markiert, aber nicht ausgeblendet

## Out of Scope (v1)
- Externer Preisvergleich gegen Online-Datenbanken (PRD-Constraint: lokal-only)
- Fuzzy-Matching von Produktnamen über Kettengrenzen hinweg
- Historischer Verlauf des Store-Preisunterschieds als Chart
- Empfehlungen "Fahre zu Lidl" basierend auf Standortdaten
