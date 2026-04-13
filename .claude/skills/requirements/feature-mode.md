# FEATURE MODE: Add a Single Feature

Use this mode when the project already has a PRD and the user wants to add a new feature.

## Phase 1: Understand the Feature
1. Check existing components/APIs to avoid duplication: `git ls-files src/components/ src/app/api/`
2. Ask the user: primary users, must-have MVP behaviors, key interactions
Use `AskUserQuestion` with clear options.

## Phase 2: Clarify Edge Cases
Ask about: duplicate data handling, error handling, validation rules, offline behavior.

## Phase 3: Write Feature Spec
- Assign next available PROJ-X ID from `features/INDEX.md`
- Create folder: `features/PROJ-X-feature-name/`
- Create spec: `features/PROJ-X-feature-name/spec.md` using [template.md](template.md)

### Migration: Legacy flat files
If the project has existing flat files (`features/PROJ-X-name.md` without a folder):
> These were created before the folder structure was introduced.
> Do NOT change them now — migration happens when `/architecture` runs on that feature.
> New features always use the folder structure.

## Phase 4: User Review
Present spec. "Approved" → ready for architecture. "Changes needed" → iterate.

## Phase 5: Update Tracking
- Add feature to `features/INDEX.md` with status **Planned**
  - Link format: `PROJ-X | [Feature Name](PROJ-X-feature-name/spec.md) | Planned`
- Add feature to PRD roadmap table in `docs/PRD.md`

## Handoff
> "Feature spec ready! Run `/architecture` to design the technical approach."

## Git Commit
```
feat(PROJ-X): Add feature specification for [feature name]
```

## Checklist
- [ ] 3–5 user stories defined
- [ ] Every AC is testable (not vague)
- [ ] 3–5 edge cases documented
- [ ] Feature folder created: `features/PROJ-X-feature-name/`
- [ ] Spec file saved: `features/PROJ-X-feature-name/spec.md`
- [ ] `features/INDEX.md` + PRD roadmap updated (folder-based link)
- [ ] User reviewed and approved
