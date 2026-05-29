# Roadmap: Weiterentwicklungskonzept

> Stand: 2026-05-29 · Grundlage: [SPECIFICATION.md](SPECIFICATION.md)
> Fokus: **Lebensmittel-Ausgaben analysieren → Einsparpotenziale finden → Preissteigerungen bewusst machen**

---

## 1. Leitprinzipien

1. **Kernziel als Filter:** Jede neue Funktion muss erkennbar zur Senkung der Lebensmittel-Ausgaben oder zur Bewusstmachung von Preissteigerungen beitragen. Wenn nicht, gehört sie in "Advanced/Settings" oder wird gestrichen.
2. **Weniger Hauptnavigation, mehr Drill-Down:** User soll von einer Insight (z.B. "Butter +18%") mit einem Klick zur Detailansicht und von dort zur Handlung (Substitution, Vergleich, Alert) kommen.
3. **Forward-looking statt nur Post-hoc:** Heute zeigt die App "was war teuer". Zukunft: "wo solltest du wechseln, vergleichen, abwarten?".
4. **Daten-Qualität ist Voraussetzung für Tiefe:** Solange Aliase und Kategorien manuell sind, bleibt die Analyse oberflächlich. Auto-Kategorisierung ist der Hebel mit dem höchsten Wirkungsgrad.
5. **Lokal-only respektieren:** Keine Cloud-Sync, kein externer Preisvergleich gegen Online-DBs (PRD-Constraint).

---

## 2. Priorisierungsmatrix (Top-10 nach Wirkung × Aufwand)

| Rang | PROJ | Titel | Wirkung | Aufwand | Begründung |
|---|---|---|---|---|---|
| 1 | **PROJ-45** | Auto-Kategorisierung Produkte | Sehr hoch | Mittel | Voraussetzung für PROJ-38, 41, 42, 49 |
| 2 | **PROJ-39** | Preis-pro-Einheit-Normalisierung | Sehr hoch | Mittel | Macht alle Vergleiche valide |
| 3 | **PROJ-38** | Kategorien-Inflation | Hoch | Niedrig | Direkt nach PROJ-45 möglich |
| 4 | **PROJ-48** | Navigations-Konsolidierung | Hoch | Niedrig | UX-Sprung, geringes Risiko |
| 5 | **PROJ-49** | Statistik-Drill-Down | Hoch | Mittel | Aktiviert bestehende Daten |
| 6 | **PROJ-43** | Multi-Store-Preisvergleich | Hoch | Mittel | Nutzt PROJ-23 (vorhanden) |
| 7 | **PROJ-46** | Smarter Alias-Vorschlag | Hoch | Niedrig | Reduziert Pflegeaufwand |
| 8 | **PROJ-42** | Spar-Alerts | Hoch | Mittel | Forward-looking-Brücke |
| 9 | **PROJ-50** | Einheitliche PDF-Viewer-Komponente | Mittel | Niedrig | Code-Schulden zurückzahlen |
| 10 | **PROJ-41** | Substitutions-Erkennung | Hoch | Hoch | Krönung von Auto-Kategorisierung |

---

## 3. Analyse-Tiefe

### PROJ-38: Kategorien-Inflation
Produkte (via Auto-Kategorisierung aus PROJ-45) in Kategorien gruppieren (Milchprodukte, Brot/Backwaren, Gemüse, Obst, Fleisch/Wurst, Tiefkühl, Drogerie, Getränke, Süßwaren …). Inflation pro Kategorie über Zeit zeigen. Neue Statistik-Card "Inflation nach Kategorie" mit horizontalem Balken oder Mini-Linechart.
- **Wert:** "Milchprodukte +9% YoY" sagt mehr als 30 Einzelartikel.
- **Abhängig von:** PROJ-45.

### PROJ-39: Preis-pro-Einheit-Normalisierung
Aus `raw_name` Mengenangaben extrahieren (250g, 1L, 6 Stück, …) und in `receipt_items` neue Felder `normalized_amount` + `normalized_unit` + `price_per_unit_cents` ableiten (€/100g, €/L, €/Stück). Statistiken nutzen die normalisierte Größe statt Stückpreis.
- **Wert:** Vergleich zwischen Packungsgrößen wird möglich. "Butter 250g vs. 500g" wird ein Produkt mit einem Preis pro 100g.
- **Risiko:** Parser-Heuristik muss robust sein; Fehler verzerren Stats. Fallback auf unit_price wenn Parsing fehlschlägt.

### PROJ-40: Warenkorb-Heatmap (Treemap)
Treemap-Visualisierung: Fläche = Ausgabenanteil eines Produkts/Kategorie über letzte 12 Monate, Farbe = YoY-Inflation (grün → rot). Auf einen Blick erkennbar: "Was kostet mich viel UND ist teurer geworden?"
- **Wert:** Priorisierung sichtbar — die teuren *und* stark gestiegenen Posten sind die richtigen Hebel.
- **Abhängig von:** PROJ-38 (Kategorien).

### PROJ-41: Substitutions-Erkennung
Innerhalb einer Kategorie Produkte mit ähnlichem Charakter aber stark unterschiedlichem Preis pro Einheit finden ("Du kaufst regelmäßig Marke X für 1,80€/100g — Marke Y aus derselben Kategorie kostet 1,20€/100g und du hast sie 2x gekauft"). Vorschläge in der Produktdetailansicht und im Spar-Alerts-Modul.
- **Wert:** Konkrete Spar-Aktion ohne externe Preisdaten — rein aus dem persönlichen Bon-Verlauf.
- **Abhängig von:** PROJ-39 (€/Einheit), PROJ-45 (Kategorien).

---

## 4. Aktionable Empfehlungen

### PROJ-42: Spar-Alerts auf der Startseite
Neue Card "Achtung & Tipps" auf Bons-Übersicht oder neue Startseite "Heute":
- "Butter ist seit 6 Monaten +18% gestiegen — Alternative: Eigenmarke gleicher Kategorie bei -22%"
- "Du kaufst Olivenöl bei REWE für 7,99€, bei Lidl für 5,49€ (-31%) — letzter Einkauf vor 12 Wochen"
- "Erdbeeren saisonal teuer — übliche Schwankung, kein echter Preisanstieg" (entkräftet falsche Alarme)

Regeln-Engine generiert Alerts aus Daten:
- Preisanstieg >X% über N Monate (mit Saisonal-Korrektur)
- Multi-Store-Differenz >Y%
- Substitution mit signifikantem Preisunterschied

- **Wert:** Genau die "forward-looking"-Brücke, die aktuell fehlt.
- **Abhängig von:** PROJ-38, 41, 43, 45.

### PROJ-43: Multi-Store-Preisvergleich
Bei Bons aus mehreren Ketten (PROJ-23 liefert `store_chain`): pro Produkt-Alias (oder Kategorie) Preis pro Einheit nach Kette aggregieren. Neue Sicht "Wo ist X am günstigsten?" als Tabelle/Chart. In Produktdetail integriert.
- **Wert:** Direkter Spar-Hebel; nutzt vorhandene Daten ohne neue Imports.
- **Abhängig von:** PROJ-39 (faire Vergleichsbasis).

### PROJ-44: Personal Inflations-Index
Persönlicher Verbraucherpreisindex auf Basis des eigenen Warenkorbs. Vergleich mit dem offiziellen Lebensmittel-VPI (statisch konfigurierbarer Wert pro Jahr — kein externer API-Call nötig). Eine prominente Zahl: "Deine persönliche Lebensmittel-Inflation: 7,4% vs. offiziell 5,1%".
- **Wert:** Eine einzige, einprägsame Kennzahl. Macht das abstrakte Thema "Inflation" greifbar.
- **Aufwand:** Niedrig — Aggregation existiert größtenteils.

---

## 5. Daten-Qualität

### PROJ-45: Auto-Kategorisierung von Produkten
Regelbasierte Engine: YAML/JSON-Regelwerk mit Patterns auf `raw_name` und `alias`. Beispiel:
```yaml
- pattern: "BUTTER|MARGARIN|SAHNE|QUARK|JOGHURT|KÄSE|MILCH"
  category: "Milchprodukte"
- pattern: "BROT|BRÖTCHEN|TOAST|BAGEL"
  category: "Brot & Backwaren"
```
Auto-Kategorisierung beim Import + manueller Override per Produktdetail. Eine Tabelle `product_categories` (alias → category) wird gepflegt.

Ersetzt langfristig:
- `seasonal`-Flag (Saisonalität wird Kategorie-Eigenschaft + Auto-Detect über Frequenz-Varianz)
- `excluded_from_stats`-Flag (Kategorien wie "Pfand", "Tabak", "Drogerie" werden per Default-Konfiguration ausgeschlossen)

- **Wert:** Schalter, der die gesamte Analyse-Tiefe ermöglicht.
- **Abhängig von:** Nichts (kann sofort starten).

### PROJ-46: Smarter Alias-Vorschlag beim Import
Beim ersten Auftauchen eines neuen `raw_name`: Vorschlagsliste basierend auf Levenshtein + Token-Set-Similarity zu bereits aliasierten raw_names. UI zeigt: "Du hast bisher 'BUTTER LANDLIEBE 250G' als 'Butter' aliasiert — möchtest du 'BUTTER LANDLIEBE 250GR' auch als 'Butter' anlegen? [Ja] [Nein] [Anderer Alias]"
- **Wert:** Reduziert manuellen Aufwand drastisch.
- **Aufwand:** Niedrig — Match-Logik aus AVIS (`avis-matching.ts`) wiederverwendbar.

### PROJ-47: Bulk-Alias-Pflege-Worklist
Eigene Sicht "Ungemappte Artikel" in `/produkte`:
- Liste aller `raw_name` ohne Alias, sortiert nach Häufigkeit
- Pro Zeile: Vorschlag (aus PROJ-46), Inline-Eingabefeld, "Übernehmen"-Button
- Bulk-Aktion: "Alle Vorschläge übernehmen" mit Confirmation

- **Wert:** Macht Alias-Pflege zu einer 5-Minuten-Aufgabe statt einer Hintergrund-Last.

---

## 6. UI/UX

### PROJ-48: Navigations-Konsolidierung
**Heute:** Bons · Import · Produkte · Statistiken · Transaktionen (5 Bereiche)

**Vorschlag:** Drei Hauptbereiche + Sekundär:

```
[Logo] Übersicht · Analyse · Einstellungen          [Import ↗] [⚙️]
```

- **Übersicht** (`/`): Bons-Liste + "Achtung & Tipps"-Card (PROJ-42) + Schnellstatistik
- **Analyse** (`/analyse`): Tabs für Inflation · Warenkorb · Produkte · Kategorien · Multi-Store
- **Einstellungen** (`/einstellungen`): Aliase · Kategorien · Konto-Modul (PROJ-24/25/26/36) · Online-Bestellungen (PROJ-20/21/32/33) · Backup · Paperless
- **Import** als Drawer/Modal über Topbar-Button — Drag-Drop bleibt erreichbar von überall

**Wert:** Das Kernziel wird sichtbar dominant; Sekundär-Module verschwinden aus der täglichen Sicht.

### PROJ-49: Statistik-Drill-Down
Jede Statistik-Card wird klickbar:
- "Teurer geworden" → Klick auf Artikel → Produktdetail mit Preischart + Substitutionsvorschlag (PROJ-41)
- "Warenkorb-Vergleich" → Klick auf Delta → Artikelliste mit individuellen Preisänderungen
- Treemap (PROJ-40) → Klick auf Kachel → Kategorie- oder Produktdetail
- "Top-Ausgaben" → Klick → Produktdetail + Kaufhistorie

**Wert:** User-Journey von Insight zu Detail in einem Klick.

### PROJ-50: Einheitliche PDF-Viewer-Komponente
Neue Komponente `src/components/pdf-viewer.tsx`, die folgendes kapselt:
- Quelle (lokale Datei, Paperless-ID)
- Zoom/Navigation
- Optional: Highlight einer Textstelle, Auto-Scroll
- Optional: Toolbar (Download, Externes Öffnen)

Ersetzt die drei Implementierungen aus PROJ-28, 29, 35. Schließt PROJ-31 (Highlight) sauber ab.

**Wert:** Code-Schulden zurückzahlen; konsistente UX.

### PROJ-51: Onboarding-Flow für Erstnutzer
Bei leerer DB: Begrüßungsbildschirm mit klarer Ansage:
> "Importiere die letzten 3 Monate Bons — wir zeigen dir deine persönliche Lebensmittel-Inflation in unter 2 Minuten."

- Drag-Drop direkt auf Startseite
- Nach Import: automatisch Auto-Kategorisierung + Spar-Alerts berechnen
- Erste Sicht: "So viel hast du in den letzten 3 Monaten ausgegeben, davon X% mehr als im Vorjahreszeitraum"

**Wert:** Direkter Wert ab dem ersten Klick — schafft Adoption.

---

## 7. Streichungen & Konsolidierungen

Aus [SPECIFICATION.md §4](SPECIFICATION.md#4-kritische-bewertung-pro-feature) abgeleitet, hier konsolidiert:

| ID | Feature | Aktion | Begründung |
|---|---|---|---|
| PROJ-6 | Watch-Folder Auto-Import | **✅ Gestrichen (2026-05-29)** | Nie implementiert; Paperless-Sync deckt Use-Case. INDEX auf "Cancelled", Spec-Datei und PRD-Eintrag entfernt |
| PROJ-14 | Saisonale Artikel-Markierung | **✅ Gestrichen (2026-05-29)** | INDEX auf "Cancelled", Spec-Verzeichnis und PRD-Eintrag entfernt. Code-Aufräumen (Spalte `product_aliases.seasonal`, Saisonal-UI, `/api/produkte/[name]/saison`) als separate Aufgabe — bei PROJ-45 mit ersetzen |
| PROJ-37 | HelloFresh Zahlungsverlauf | **Behalten (Nutzerwunsch 2026-05-29) — strikt kapseln** | Bleibt als eigenständiger Tab. Harte Regel: HelloFresh-Daten dürfen *niemals* in eBon-Statistiken (Inflation, Warenkorb, Top-Produkte, Trends) einfließen. Verbleibt isoliert in `hellofresh_transactions` ohne Verknüpfung zu `receipts` |
| PROJ-24, 25, 26, 29, 36 | Konto-Modul + Tx-Anreicherung + PDF-Viewer Tx + Kategorien | **Behalten, aber in "Einstellungen → Konto" verschieben** | Mächtig, aber orthogonal zum Kernziel — soll nicht die Hauptnavigation belegen |
| PROJ-20, 21, 32, 33 | Bestellung/AVIS-Module | **Konsolidieren** zu einem Modul "Online-Bestellungen" in Einstellungen | Spezialfall REWE-Lieferdienst; Bon-Detail behält AVIS-Status-Anzeige inline |
| PROJ-28, 29, 35 | Drei PDF-Viewer | **Konsolidieren** zu einer Komponente (PROJ-50) | Code-Schulden |
| PROJ-13 | Ausgeblendete Artikel als eigener Tab | **Vereinfachen** zu einem Filter-Toggle in `/produkte` | Eigener Tab überdimensioniert |
| PROJ-8 | Manuelles Excluded-Flag | **Konsolidieren** in PROJ-45 Auto-Kategorisierung | Default-Ausschluss per Kategorie ist robuster |

**Auswirkung:** ~20% weniger Code, ~30% weniger Hauptnavigations-Optionen, konzentrierter Fokus auf das Kernziel — ohne Verlust funktional wertvoller Bestandteile (alles bleibt erreichbar, nur an passenderer Stelle).

---

## 8. Out of Scope (bewusst nicht empfohlen)

- **Mobile App** — Constraint laut PRD (lokal-only, Desktop-Browser reicht)
- **Cloud-Sync / Multi-Device** — Constraint laut PRD
- **Externer Preisvergleich (gegen Online-Preisdatenbanken)** — externe Abhängigkeit, lokal-only Constraint, rechtliche Grauzone
- **OCR für gescannte PDFs** — out of scope laut PRD
- **Budgetplanung / Soll-Ist-Vergleich mit Zielwerten** — out of scope laut PRD
- **KI-basierte Produktklassifizierung (LLM-Embedding)** — gegen lokal-only-Prinzip; regelbasierte Auto-Kategorisierung (PROJ-45) reicht
- **Eigenes Auth/User-System** — Single-User-Constraint

---

## 9. Empfohlene Reihenfolge nächste Sprints

**Sprint 1 — Daten-Qualitäts-Fundament (PROJ-45, 46, 47)**
Ohne saubere Kategorien und Aliase bleibt alles oberflächlich. Hier ist der größte Wirkungsgrad.

**Sprint 2 — Analyse-Tiefe (PROJ-38, 39, 49)**
Kategorien-Inflation + €/Einheit + Drill-Down — direkter sichtbarer Wert nach Sprint 1.

**Sprint 3 — UI-Konsolidierung + Aufräumen (PROJ-48, 50, Streichungen)**
Navigations-Reduktion, Konto-Modul in Einstellungen, drei PDF-Viewer mergen, HelloFresh/Saisonal/Watch-Folder entfernen.

**Sprint 4 — Aktionable Insights (PROJ-40, 42, 43)**
Treemap + Spar-Alerts + Multi-Store. Hier wird die App "forward-looking".

**Sprint 5 — Krönung (PROJ-41, 44, 51)**
Substitutions-Erkennung, Personal Inflations-Index, Onboarding.

---

## 10. Nächster Schritt für den Nutzer

1. SPECIFICATION + ROADMAP durchgehen, Streichungs-Vorschläge entscheiden.
2. Top-3 PROJ-Vorschläge für nächsten Sprint auswählen.
3. Pro ausgewähltem PROJ: `/requirements` mit dem Roadmap-Eintrag als Input ausführen → vollständige Spec entsteht in `features/PROJ-XX-name/spec.md`.
4. Danach `/architecture` → `/frontend`/`/backend` → `/qa` → `/deploy` wie gewohnt.
