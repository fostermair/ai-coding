# Context Map — Token-Optimierungskonzept

**Datum:** 2026-04-10  
**Ziel:** Token-Verbrauch im Agenten-Workflow durch gezielte Kontext-Steuerung reduzieren

---

## 1. Das Problem: Jeder Agent beginnt bei Null

Im aktuellen Workflow liest **jeder Agent** beim Start eigenständig die Codebase, um zu verstehen, was relevant ist:

| Agent | Discovery-Schritte (aktuell) |
|---|---|
| Architecture | `features/INDEX.md` + 4× git/ls-Scan + 5–8 Quelldateien lesen |
| Frontend | `features/INDEX.md` + Spec + 5× ls-Befehle + 5–6 Quelldateien lesen |
| Backend | `features/INDEX.md` + Spec + 4× git/ls + 4–5 Quelldateien lesen |
| QA | `features/INDEX.md` + Spec + 4× git log + 5–6 Quelldateien lesen |

**Kernproblem:** Der Architekt macht diese Discovery-Arbeit bereits vollständig — und verwirft das Wissen danach. Frontend, Backend und QA starten mit derselben breiten Suche neu, obwohl der Architekt bereits weiß, welche 3–5 Dateien wirklich relevant sind.

---

## 2. Die Lösung: Context Map im Feature-Spec

Der Architekten-Agent schreibt am Ende seiner Arbeit einen neuen Abschnitt `## Context Map` in die Feature-Spec. Dieser Abschnitt enthält:

- Die **exakt relevanten Dateipfade** (nicht mehr, nicht weniger)
- **Kritische Typen & Interfaces** direkt inline (kein Dateizugriff nötig)
- Explizite **"Nicht lesen"**-Liste, um irrelevante Scans zu verhindern
- **Änderungstyp** pro Datei (Lesen / Erweitern / Neu erstellen)

Downstream-Agenten (Frontend, Backend, QA) lesen **ausschließlich** diese Liste, anstatt selbst die Codebase zu scannen.

---

## 3. Token-Kalkulation: Vorher vs. Nachher

### Annahmen (mittleres Projekt, ~40 Dateien)

| Einheit | Tokens (geschätzt) |
|---|---|
| `features/INDEX.md` | 500 |
| Feature-Spec (ohne Context Map) | 800 |
| Feature-Spec (mit Context Map) | 1.800 |
| Einzelne Quelldatei (Komponente) | 1.500 |
| Einzelne API-Route | 1.000 |
| 1× git ls / ls-Befehl | 200 |
| 1× git log | 300 |

### Vorher: Token-Verbrauch pro Feature (4 Agenten)

```
Architecture:  500 (INDEX) + 4×200 (git/ls) + 6×1500 (Dateien) = 10.300 Token
Frontend:      500 (INDEX) + 800 (Spec) + 5×200 (ls) + 6×1500 (Dateien) = 11.300 Token
Backend:       500 (INDEX) + 800 (Spec) + 4×200 (ls) + 5×1000 (Dateien) = 7.100 Token
QA:            500 (INDEX) + 800 (Spec) + 4×300 (git log) + 5×1500 (Dateien) = 10.000 Token
─────────────────────────────────────────────────────────────────────────────
GESAMT:        38.700 Token pro Feature
```

### Nachher: Token-Verbrauch pro Feature (mit Context Map)

```
Architecture:  500 (INDEX) + 4×200 (git/ls) + 6×1500 (Dateien)  = 10.300 Token
               (unvermeidbar — Architekt macht die einmalige Discovery)

Frontend:      500 (INDEX) + 1.800 (Spec+Context Map) + 3×1500   = 6.800 Token
               (liest nur die 3 explizit genannten Dateien)

Backend:       500 (INDEX) + 1.800 (Spec+Context Map) + 2×1000   = 4.300 Token
               (liest nur die 2 explizit genannten API-Files)

QA:            500 (INDEX) + 1.800 (Spec+Context Map) + 3×1500   = 6.800 Token
               (liest nur die genannten Dateien + QA-Ergebnisse)
─────────────────────────────────────────────────────────────────────────────
GESAMT:        28.200 Token pro Feature
```

### Einsparung

| | Token | Kosten (claude-sonnet ~$3/1M) |
|---|---|---|
| Vorher (pro Feature) | 38.700 | $0,116 |
| Nachher (pro Feature) | 28.200 | $0,085 |
| **Einsparung pro Feature** | **10.500 (−27%)** | **$0,032** |
| Einsparung bei 20 Features | 210.000 | $0,63 |
| Einsparung bei 50 Features | 525.000 | $1,58 |

> **Wichtig:** Die Einsparung wächst mit der Projektgröße. Bei 100+ Dateien im Projekt liest ein Agent ohne Context Map deutlich mehr irrelevante Dateien — die Einsparung steigt auf 35–45%.

---

## 4. Konkrete Änderungen

### 4.1 Neuer Abschnitt in `features/template.md`

```markdown
## Context Map (Solution Architect)
_Wird von /architecture befüllt. Downstream-Agenten lesen NUR diese Dateien._

### Relevante Dateien

| Datei | Änderungstyp | Warum relevant |
|---|---|---|
| `src/components/bon-list.tsx` | Erweitern | Listenkomponente erhält Filter-Props |
| `src/app/api/bons/route.ts` | Erweitern | Neuer Query-Parameter `?status=` |
| `src/lib/supabase.ts` | Nur lesen | DB-Client, keine Änderung |

### Kritische Typen (inline — kein Dateizugriff nötig)

\`\`\`typescript
// src/types/bon.ts
type BonStatus = 'offen' | 'bezahlt' | 'storniert'
type Bon = {
  id: string
  status: BonStatus
  total: number
  created_at: string
}
\`\`\`

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/statistiken/` — unberührt
- `src/components/ui/` — shadcn, keine Änderung
- `src/app/import/` — separates Feature
```

### 4.2 Änderung in `skills/architecture/SKILL.md`

Neuer letzter Schritt im Workflow:

```markdown
### 5. Context Map schreiben (NEU)
Befülle den Abschnitt `## Context Map` in der Feature-Spec:
- Liste ALLE Dateien, die Frontend/Backend/QA lesen müssen
- Kopiere relevante Typen/Interfaces direkt inline (spart Downstream-Tokens)
- Liste explizit Dateien, die NICHT gelesen werden müssen
- Kategorisiere: "Nur lesen" / "Erweitern" / "Neu erstellen"

Ziel: Ein Frontend-/Backend-/QA-Agent soll ausschließlich auf Basis der 
Feature-Spec (inkl. Context Map) arbeiten können — ohne selbst zu scannen.
```

### 4.3 Änderung in `skills/frontend/SKILL.md`, `backend/SKILL.md`, `qa/SKILL.md`

Ersetze den aktuellen "Before Starting"-Block:

```markdown
## Before Starting
1. Read `features/INDEX.md` for project context
2. Read the feature spec including the **Context Map section**
3. Read ONLY the files listed in the Context Map — do NOT scan the codebase independently
4. Types/Interfaces in the Context Map are already extracted — no need to open source files for them

> ⚠️ If the Context Map section is empty or missing, run `/architecture` first.
```

---

## 5. Vorschlag: Neue Ordnerstruktur (optional)

### Aktuell (flach)

```
features/
  INDEX.md
  PROJ-1-bon-import.md        ← alles in einer Datei
  PROJ-2-statistiken.md
  PROJ-3-bon-filter.md
```

### Vorschlag: Feature-Ordner (modular)

```
features/
  INDEX.md
  PROJ-1-bon-import/
    spec.md            ← Requirements (was gebaut wird) — /requirements
    context-map.md     ← Dateikarte + Typen — /architecture
    qa-results.md      ← Testergebnisse — /qa
    deployment.md      ← Deploy-Notizen — /deploy
  PROJ-2-statistiken/
    spec.md
    context-map.md
    ...
```

### Warum Feature-Ordner besser sind

| Aspekt | Flache Datei | Feature-Ordner |
|---|---|---|
| Tokens beim Lesen | Jeder Agent liest alles | Jeder Agent liest nur seine Datei |
| Wachstum | Datei wird mit jeder Phase größer | Bleibt übersichtlich |
| Context Map isoliert | Nein — in Gesamt-Spec eingebettet | Ja — eigene Datei, gezielt ladbar |
| QA-Ergebnisse | Blähen die Spec auf | Eigene Datei, kein Rauschen |
| Übersichtlichkeit | Eine große Datei | Klare Verantwortung pro Datei |

### Token-Vorteil durch Trennung

Mit Feature-Ordnern liest der Backend-Agent nur `spec.md` + `context-map.md` (≈ 2.200 Token), statt die komplette Spec **inkl. QA-Ergebnissen und Deployment-Notes** (≈ 3.500+ Token nach mehreren Phasen).

Einsparung allein durch Dateitrennung: weitere **~10–20%** auf den Downstream-Agenten.

---

## 6. Implementierungsplan

| Schritt | Was | Aufwand |
|---|---|---|
| 1 | `features/template.md` → Context Map Abschnitt ergänzen | 5 min |
| 2 | `skills/architecture/SKILL.md` → Schritt 5 "Context Map schreiben" | 10 min |
| 3 | `skills/frontend/SKILL.md` → Before Starting anpassen | 5 min |
| 4 | `skills/backend/SKILL.md` → Before Starting anpassen | 5 min |
| 5 | `skills/qa/SKILL.md` → Before Starting anpassen | 5 min |
| 6 | (Optional) Ordnerstruktur auf Feature-Ordner umstellen | 30 min |

---

## 7. Zusammenfassung

Das Kernprinzip: **"Der Architekt liest breit, schreibt präzise — alle anderen lesen präzise."**

Der Architekt wird zur Kontext-Linse des Teams. Er trägt einmalig die Discovery-Kosten und investiert diese Arbeit in eine strukturierte Context Map. Jeder nachfolgende Agent profitiert davon und spart 30–50% seiner Discovery-Tokens.

Die Ordnerstruktur-Änderung ist optional, aber empfohlen: Sie trennt die Verantwortlichkeiten sauber und verhindert, dass Spec-Dateien mit jeder Phase aufgebläht werden.
