# Spezifikation: eBon Analyzer — Ist-Zustand & kritische Bewertung

> Stand: 2026-05-29 · 37 Features (PROJ-1 … PROJ-37) · Grundlage für ROADMAP.md

---

## 1. Überblick: Kernziel vs. Ist-Funktionsumfang

**Kernziel laut [PRD](PRD.md):** Lokale Web-App zur Analyse von REWE eBons. Nutzer sollen ihre Lebensmittel-Ausgaben verstehen, Preissteigerungen ihrer Stammprodukte erkennen und Einsparpotenziale aufdecken — vollständig lokal, ohne Cloud.

**Ist-Zustand:** Über 37 Features ist die App weit über das Kernziel hinausgewachsen. Sie ist heute:

| Bereich | Anteil am Funktionsumfang | Zielbeitrag |
|---|---|---|
| eBon-Import + Produktanalyse (Kern) | ~30% | **Hoch** |
| Statistiken (Inflation, Trends, Warenkorb) | ~15% | **Hoch** |
| Bank-Konto-Modul (Import, Matching, Kategorien) | ~20% | **Niedrig** (orthogonal) |
| Bestellung-/AVIS-Lieferdienst-Tracking | ~15% | **Niedrig** (Sonderfall) |
| PDF-Viewer-Infrastruktur (3 separate Implementierungen) | ~10% | **Mittel** (Beleg-Zugriff) |
| HelloFresh-Modul | ~5% | **Negativ** (verzerrt Grocery-Stats) |
| Paperless-ngx-Integration + Konfig + Backup | ~5% | **Mittel** |

**Gap-Diagnose:** Die App ist exzellent in **Post-hoc-Analyse** ("was hat sich verteuert"), aber schwach in **forward-looking Empfehlung** ("hier kannst du sparen"). Die Hauptnavigation hat 5 gleichberechtigte Bereiche, von denen 2 (Transaktionen, große Teile von Import) das Kernziel kaum stützen.

---

## 2. Datenmodell

Alle Daten in SQLite (`data/ebon.db`, WAL-Modus, Foreign Keys aktiv). Schema in [src/lib/db.ts](../src/lib/db.ts).

### Kern-Domäne: Bons & Produkte
| Tabelle | Zweck | Schlüsselbeziehungen |
|---|---|---|
| `receipts` | Ein Bon pro Zeile. Felder: store_name, store_chain (rewe/lidl/kaufland/edeka/sonstige), receipt_nr, market_nr, receipt_date, total_amount_cents, paperless_doc_id, is_virtual, bank_transaction_id | → bank_transactions |
| `receipt_items` | Artikel eines Bons. Felder: raw_name, item_type (product/pfand/leergut), quantity, unit_price_cents, total_price_cents, bonus_excluded, concessionaire_code | → receipts |
| `item_discounts` | Rabatte pro Artikel. Felder: description, amount_cents, tax_code | → receipt_items |
| `product_aliases` | raw_name → alias-Mapping. Flags: excluded_from_stats, seasonal | PK: raw_name |

### Bestellung & AVIS (REWE-Lieferdienst)
| Tabelle | Zweck |
|---|---|
| `bestellung_items` | Bestellte Artikel pro order_number (Menge, Einheit, Preis) |
| `avis_matches` | Fuzzy-Match AVIS-Artikel ↔ receipt_item. Felder: avis_item_name, confidence (0-100), status (pending/confirmed/rejected/auto_set), match_source |
| `import_log` | Vereinheitlichter Log aller Imports. Felder: source_type (ebon/avis/bestellung), pdf_path, paperless_doc_id, order_number, order_date, order_total_cents |

### Bank & Transaktionen
| Tabelle | Zweck |
|---|---|
| `bank_transactions` | Kontotransaktionen. Felder: buchungsdatum, typ (kartenzahlung/überweisung/gutschrift/sonstige), beschreibung, betrag_cents, periode, konto_iban, match_status, matched_receipt_id, hidden |
| `bank_statement_log` | Metadaten pro Kontoauszug-Import (konto_iban + periode unique) |
| `transaction_aliases` | beschreibung → alias + logo_path (PROJ-26) |
| `market_aliases` | store_name → alias + logo_path (PROJ-27) |
| `transaction_categories` | muster → kategorie + farbe (PROJ-36) |

### HelloFresh (isoliert)
| Tabelle | Zweck |
|---|---|
| `hellofresh_transactions` | Eigene Tabelle für Meal-Kit-Bestellungen. Nicht verknüpft mit receipts oder bank_transactions |

**Strukturelle Beobachtungen:**
- Schema-Migrationen ad-hoc als `ALTER TABLE` in `initSchema()` — bei 40+ Migrationen wird das fragil. Empfehlung: dedizierte Migrations-Tabelle + versionierte Skripte.
- `receipts.store_chain` wurde nachträglich eingeführt; Backfill-Logik korrigiert "falsch als rewe markierte" Bons in jedem Startup — Code-Smell.
- `hellofresh_transactions` steht isoliert: keine FK zu receipts/bank_transactions. Datenmodell signalisiert: das gehört eigentlich nicht hierher.

---

## 3. Funktionsbereiche

### 3.1 Import-Pipelines

| Format | Parser | Ziel-Tabellen | Auslöser |
|---|---|---|---|
| REWE eBon (PDF) | `parseReweEbon()` | receipts, receipt_items, item_discounts | Drag-Drop, Paperless-Sync |
| Lidl eBon (PDF) | `parseLidlEbon()` | dito (store_chain='lidl') | Drag-Drop |
| Kaufland eBon (PDF) | `parseKauflandEbon()` | dito (store_chain='kaufland') | Drag-Drop |
| AVIS Lieferstatus (PDF) | `parseAvis()` | avis_matches, import_log | Drag-Drop, Paperless-Sync |
| Bestellung (PDF) | `parseBestellung()` | bestellung_items, import_log | Drag-Drop, Paperless-Sync |
| Kontoauszug (PDF) | `parseKontoauszug()` | bank_transactions, bank_statement_log | Drag-Drop |
| HelloFresh (CSV/JSON) | Custom | hellofresh_transactions | Manuell |

**Auffälligkeiten:**
- 7 verschiedene Parser, alle textbasiert (keine OCR) → robust nur für maschinen-lesbare PDFs (PRD-Constraint OK)
- Deduplikation pro Format unterschiedlich implementiert (receipts: receipt_nr+market_nr+date; bank_tx: iban+date+amount+beschreibung; bestellung: order_number) → Logik nicht zentralisiert
- Paperless-ngx-Sync existiert für eBon, AVIS, Bestellung — **nicht** für Kontoauszug und HelloFresh

### 3.2 Bon-Verwaltung

- **Bon-Übersicht** (`/`): Liste mit store_chain-Logo, Datum, Summe; Filter; markiert virtuelle Bons separat
- **Bon-Detail**: Artikelliste mit Aliasen, AVIS-Status-Badges, eingebetteter PDF-Viewer (PROJ-28); Tabs für Bestellung/AVIS-PDFs
- **Virtuelle Bons** (PROJ-25): Auto-erzeugt aus unmatched Kartenzahlungen — eigene Synthese ohne Artikel

### 3.3 Produktdatenbank (`/produkte`)

- Liste aller raw_names mit alias, Häufigkeit, Ø-Preis, Preistrend (↑↓→), 12-Monats-Trend
- Spaltenfilter (PROJ-15): Text, min/max Preis, Saison, Trend
- Aliasing-UI: raw_name → alias + Flags (excluded_from_stats, seasonal)
- Tab "Ausgeblendete Artikel" (PROJ-13) als separate Sicht
- Bulk-Alias-Import aus AVIS-DB (PROJ-19)

### 3.4 Statistik-Modul (`/statistiken`)

**Card-Übersicht (Dashboard, PROJ-5):**
- Top-Produkte nach Ausgaben / Häufigkeit
- "Teurer geworden / Günstiger geworden" (PROJ-9, 12)
- Monatstrend-Chart (PROJ-17)
- Warenkorb-Vergleich vs. Vorjahr und vs. Voreinkauf (PROJ-16)
- Rabatt-Statistik
- Preisentwicklungs-Chart pro Produkt (PROJ-4)

**Berechnungsbasis:**
- `unit_price_cents` als kanonischer Preis (nicht total_price)
- Aliase als kanonische Produktidentität
- Excluded-Flag filtert raus; Saisonal-Flag wird angezeigt aber nicht automatisch ausgeschlossen
- YoY-Inflation: CAGR-Formel (last/first)^(1/years)−1

### 3.5 Konto-Modul (`/transaktionen`)

- Transaktionsliste mit Match-Status-Indikator (matched/pending/unmatched/virtual)
- Transaction-Alias + Logo (PROJ-26)
- Kategorien mit Farbe (PROJ-36, regelbasiert über Muster auf beschreibung)
- Eingebetteter PDF-Viewer des Kontoauszugs mit Auto-Highlight der angeklickten Zeile (PROJ-29, 31)
- Konto-Matching-Algorithmus (`runMatching()`): ±1 Tag, exakter Betrag, store_chain-Filter für Kartenzahlung; Single→auto, Multi→pending, Zero→virtueller Bon

### 3.6 Bestellung/AVIS-Modul

- Lieferstatus-Tracking: bestellt → geliefert (AVIS) → auf Bon
- Manuelle AVIS-Zuweisung (PROJ-21) für Low-Confidence-Matches
- Mehrere Bestellungen pro Bon (PROJ-33): Bestellungs-Versionierung
- Import-Ansicht mit Reitern und Datei-Historien (PROJ-34, 35)

### 3.7 Konfiguration

- Settings-Dialog (PROJ-22) hinter Zahnrad-Icon:
  - AVIS-DB zurücksetzen
  - Alle Aliase löschen
  - Backup/Restore (PROJ-30) der gesamten SQLite-DB

---

## 4. Kritische Bewertung pro Feature

**Legende Zielbeitrag:** Hoch = stützt Kernziel direkt · Mittel = unterstützend · Niedrig = orthogonal · Negativ = verzerrt/schadet

| ID | Feature | Status | Zielbeitrag | Empfehlung | Begründung |
|---|---|---|---|---|---|
| PROJ-1 | eBon Import & Parser | Approved | **Hoch** | Behalten | Fundament |
| PROJ-2 | Bon-Übersicht & Detail | Approved | **Hoch** | Behalten | Fundament |
| PROJ-3 | Produktdatenbank & Aliase | Approved | **Hoch** | Vereinfachen | Manueller Pflegeaufwand zu hoch — siehe ROADMAP PROJ-45/46/47 |
| PROJ-4 | Preisentwicklungs-Chart | Approved | **Hoch** | Behalten | Kernfunktion |
| PROJ-5 | Statistik-Dashboard | Approved | **Hoch** | Konsolidieren | Zu viele Cards ohne Drill-Down; keine User-Journey — siehe ROADMAP PROJ-49 |
| PROJ-6 | Watch-Folder Auto-Import | **Cancelled** | Niedrig | **Gestrichen (2026-05-29)** | Nicht implementiert; Paperless-Sync deckt Use-Case ab |
| PROJ-7 | Datenexport (Excel/CSV) | Approved | Mittel | Behalten | Nische, aber günstig zu betreiben |
| PROJ-8 | Produkt-Ausblendung | Approved | **Hoch** | Konsolidieren | In Auto-Kategorisierung integrieren (PROJ-45) |
| PROJ-9 | Preissteigerungs-Analyse | Approved | **Hoch** | Behalten + erweitern | Kernfunktion; aktuell nur pro Artikel — Kategorien fehlen (PROJ-38) |
| PROJ-10 | Preistrend-Indikator | Approved | **Hoch** | Behalten | Gut |
| PROJ-11 | Preistrend 12 Monate | Approved | **Hoch** | Behalten | Gut |
| PROJ-12 | Artikel-Inflation YoY | Approved | **Hoch** | Behalten | Kernfunktion |
| PROJ-13 | Ausgeblendete-Artikel-Tab | Approved | Mittel | Vereinfachen | Eigener Tab für Pflege-Edge-Case — als Filter im Hauptview reicht |
| PROJ-14 | Saisonal-Markierung | **Cancelled** | Niedrig | **Gestrichen (2026-05-29)** | Manuell zu pflegen; nutzt sich kaum; ersatzweise Auto-Saisonalität via Frequenz-Varianz in PROJ-45 vorgesehen. Code/DB-Spalte `seasonal` separat aufzuräumen |
| PROJ-15 | Spaltenfilter | Approved | Mittel | Behalten | Solide UX |
| PROJ-16 | Einkaufskorb-Vergleich | Approved | **Hoch** | Behalten + Drill-Down | Stark, aber Klick auf Delta zeigt keine Produktdetails |
| PROJ-17 | Monatlicher Langzeittrend | Approved | **Hoch** | Behalten | Gut |
| PROJ-18 | Paperless-ngx Sync | Approved | Mittel | Behalten | Mehrwert für Power-User, ersetzt Watch-Folder |
| PROJ-19 | AVIS-Import & Auto-Alias | Approved | Mittel | Behalten | Hauptnutzen: automatische Alias-Befüllung |
| PROJ-20 | AVIS-Status in Bon | Approved | Niedrig | **Konsolidieren** | Mit PROJ-21 und PROJ-32/33 zu einem "Online-Bestellungen"-Modul mergen |
| PROJ-21 | Manuelle AVIS-Zuweisung | Approved | Niedrig | **Konsolidieren** | Siehe PROJ-20 |
| PROJ-22 | Konfigurations-Menü | Approved | Mittel | Behalten | Notwendig |
| PROJ-23 | Multi-Supermarkt (Lidl/Kaufland) | Approved | **Hoch** | Behalten + nutzen | Voraussetzung für Multi-Store-Preisvergleich (ROADMAP PROJ-43) |
| PROJ-24 | Kontoauszug-Import | Approved | Niedrig | **In Advanced verschieben** | Eindrucksvoll, aber nicht zum Kernziel — Hauptnav entlasten |
| PROJ-25 | Bon↔Konto-Matching + virtuelle Bons | Approved | Niedrig | **In Advanced** | Virtuelle Bons verzerren Grocery-Statistik bei Nicht-Lebensmittel-Transaktionen |
| PROJ-26 | Transaktions-Anreicherung | Approved | Niedrig | **In Advanced** | Verbessert Konto-Modul, das selbst out-of-scope ist |
| PROJ-27 | UX-Verbesserungen Bon/Tx | Approved | Mittel | Behalten | market_aliases sinnvoll für Bons |
| PROJ-28 | PDF-Viewer Bon-Detail | Approved | Mittel | **Konsolidieren** | Eine von drei separaten PDF-Viewer-Komponenten |
| PROJ-29 | PDF-Viewer Transaktionen | Approved | Niedrig | **Konsolidieren** | dito |
| PROJ-30 | Backup & Restore | Approved | Mittel | Behalten | Lokal-only erfordert das |
| PROJ-31 | PDF-Highlight & Scroll | In Review | Niedrig | Fertigstellen oder streichen | Polish-Feature; Aufwand vs. Wert prüfen |
| PROJ-32 | Bestellung-Import & Linking | Deployed | Niedrig | **Konsolidieren** | In "Online-Bestellungen"-Modul |
| PROJ-33 | Mehrere Bestellungen pro Bon | Approved | Niedrig | **Konsolidieren** | dito |
| PROJ-34 | Import-Tabs mit History | Approved | Mittel | Behalten | Gute UX für Import-Workflows |
| PROJ-35 | PDF-Inline in Import-History | Deployed | Niedrig | **Konsolidieren** | Dritte PDF-Viewer-Implementierung |
| PROJ-36 | Transaktions-Kategorien | Approved | Niedrig | **In Advanced** | Stützt Konto-Modul |
| PROJ-37 | HelloFresh Import & Tab | Approved | **Negativ** | **Behalten (Nutzer-Entscheidung 2026-05-29) — strikt kapseln** | Verzerrt Grocery-Inflation; eigene Tabelle ohne Integration; muss strikt aus eBon-Statistiken ausgeschlossen bleiben |

**Zusammenfassung der Empfehlungen:**
- **Gestrichen am 2026-05-29 (2):** PROJ-6 (Watch-Folder), PROJ-14 (Saisonal)
- **PROJ-37 (HelloFresh):** auf Nutzerwunsch behalten, aber strikt kapseln (nie in eBon-Statistik mischen)
- **In "Advanced/Settings" verschieben (4):** PROJ-24/25/26/36 (Konto-Modul)
- **Konsolidieren zu einem Modul (5+3):** PROJ-20/21/32/33 (Online-Bestellungen) + PROJ-28/29/35 (PDF-Viewer)
- **Drill-Down einbauen (2):** PROJ-5, PROJ-16
- **Vereinfachen (2):** PROJ-8 (in Auto-Kategorisierung), PROJ-13 (als Filter statt Tab)

---

## 5. Architektur-Schmerzpunkte

1. **Drei parallele PDF-Viewer-Implementierungen** (PROJ-28, 29, 35). Jeder hat eigene Logik für Paperless-Fetch, Highlight, Zoom. Code-Duplikation und inkonsistente UX.
2. **Zwei separate Matching-Engines** (AVIS↔eBon-Item, Bank-Tx↔Bon). Ähnliche Fuzzy-Match-Konzepte (Name/Betrag/Datum-Scoring) doppelt implementiert.
3. **Statistik-Seite als Card-Wand ohne Navigation.** Klick auf "Top teurer geworden" führt nicht zu einer Drill-Down-Ansicht des Produkts. User muss manuell nach `/produkte` wechseln und suchen.
4. **Hauptnavigation überfrachtet.** 5 Top-Level-Bereiche, davon 2 (Transaktionen, Import) Sekundär-Bereiche, die nicht ständig gebraucht werden.
5. **Schema-Migrationen unstrukturiert.** ~40 `ALTER TABLE`-Statements in einer Funktion mit `PRAGMA table_info`-Checks. Bei nächster größerer Migration unwartbar.
6. **`receipts.is_virtual` mischt zwei Konzepte.** Virtuelle Bons aus Bank-Transaktionen ohne Artikel verzerren alle Stats, sobald nicht-Lebensmittel-Transaktionen importiert werden (Tankstelle, Restaurant). Aktuell nur empirisch durch store_chain='sonstige' gefiltert.
7. **Bestellung-Modul mit Versionierung (PROJ-33)** ist erheblich komplex für einen Sonderfall, der nur REWE-Lieferdienst-Nutzer betrifft.

---

## 6. Datenqualitäts-Probleme

1. **Alias-Pflege ist manuell und der größte UX-Engpass.** Jeder neue raw_name muss von Hand aliasiert werden, sonst zerfällt die Statistik ("BUTTER 250G" und "BUTTER" werden separat gezählt). AVIS-Bulk-Alias-Import (PROJ-19) hilft, aber nur für AVIS-Nutzer.
2. **Keine Kategorisierung von Produkten.** Inflation lässt sich nur pro Einzelartikel zeigen — nicht pro Kategorie ("Milchprodukte +8% YoY"). Das ist die meist-gewünschte Sicht in der Realität.
3. **Keine Preis-pro-Einheit-Normalisierung.** "Butter 250g für 2,49€" und "Butter 500g für 4,29€" werden als unterschiedliche Produkte gezählt; Preisvergleich nicht möglich.
4. **HelloFresh-Daten mischen sich potenziell in Grocery-Statistiken**, sobald jemand sie mit eBons in einer Sicht zusammenführt. Heute strikt getrennt, aber konzeptionell falsch dimensioniert.
5. **Saisonale Artikel** werden gleich gewichtet wie Stammartikel — Inflation für "Erdbeeren" springt jährlich, ohne dass das ein "Preissteigerungs"-Signal ist.
6. **Konzessionsware (Bäckereien, Metzger im Markt)** wird durch `concessionaire_code` markiert, aber nicht gesondert ausgewertet — könnte sinnvolle Sub-Analyse sein.

---

## 7. Fazit

Die App ist technisch beeindruckend, aber sie ist **breit statt tief**. Die Stärken (Inflation-Analyse, Warenkorb-Vergleich, Preisentwicklung) sind im Kern solide. Die Schwächen liegen in:

- **Verstreutem Fokus:** Bank-Modul + HelloFresh kosten Wartung und Mental Load, ohne das Kernziel zu stützen.
- **Fehlender User-Journey:** Vom "ich sehe meine Inflation" zum "ich tue etwas dagegen" gibt es keine Brücke.
- **Datenqualitäts-Engpass:** Ohne Auto-Kategorisierung und Preis-pro-Einheit bleiben die mächtigen Auswertungen oberflächlich.

Konkrete Schritte zur Schärfung siehe [ROADMAP.md](ROADMAP.md).
