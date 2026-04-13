# Context Map: PROJ-X Feature Name

**Created:** YYYY-MM-DD  
**Architect:** Solution Architect (AI)  
**Feature Spec:** [spec.md](spec.md)

---

## Tech Design

### Component Structure

```
Page / Screen
+-- ComponentA (purpose)
|   +-- SubComponent
+-- ComponentB (purpose)
+-- Empty State
```

### Data Model

Describe what is stored, field constraints, and where (localStorage vs. database). No code.

```
Each [Entity] has:
- id (unique)
- [field]: [type, constraints]
- created_at: timestamp

Stored in: [localStorage / Supabase table: table_name]
```

### Tech Decisions

Explain WHY specific tools/approaches are chosen (plain language, no code).

### Dependencies (packages to install)

- `package-name` — brief purpose

---

## Context Map

> ⚠️ Downstream agents (Frontend, Backend, QA) read **ONLY** the files listed below.
> Do NOT scan the codebase independently.

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/example.tsx` | Erweitern | Erhält neue Props |
| `src/app/api/example/route.ts` | Erweitern | Neuer Query-Parameter |
| `src/components/new-component.tsx` | Neu erstellen | Neue Komponente |
| `src/lib/supabase.ts` | Nur lesen | DB-Client, Referenz |

**Legende:** Nur lesen · Erweitern · Neu erstellen

### Kritische Typen & Interfaces

```typescript
// Direkt inline — keine Quelldatei öffnen nötig
// type ExampleType = { id: string; status: 'active' | 'inactive' }
```

### Nicht lesen (irrelevant für dieses Feature)

- `src/app/[irrelevant-route]/` — unberührt
- `src/components/ui/` — shadcn, keine Änderung
