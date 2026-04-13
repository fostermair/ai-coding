# INIT MODE: New Project Setup

Use this mode when the user provides a project description for the first time.

## Phase 1: Understand the Project
Ask the user interactive questions to clarify:
- Core problem this product solves?
- Primary target users?
- Must-have features for MVP vs. nice-to-have?
- Existing tools/competitors? What's different?
- Backend needed? (User accounts, data sync, multi-user)
- Constraints? (Timeline, budget, team size)

Use `AskUserQuestion` with clear single/multiple choice options.

## Phase 2: Create the PRD
Fill out `docs/PRD.md` with: Vision, Target Users, Core Features (Roadmap with P0/P1/P2), Success Metrics, Constraints, Non-Goals.

## Phase 3: Break Down into Features
Apply Single Responsibility to split roadmap into individual features. Each = ONE testable, deployable unit. Identify dependencies and suggest build order. Present breakdown for user review.

## Phase 4: Create Feature Specs
For each feature (after user approval):
- Create folder `/features/PROJ-X-feature-name/`
- Create `/features/PROJ-X-feature-name/spec.md` using [template.md](template.md)
- The folder will hold `context-map.md`, `qa-results.md`, `deployment.md` in later phases

## Phase 5: Update Tracking
- Update `features/INDEX.md` with all features and statuses
- Verify PRD roadmap table matches feature specs

## Phase 6: User Review
Present: PRD summary, feature list, build order, recommended first feature.

## Handoff
> "Project setup complete! Run `/architecture` to design PROJ-1."

## Git Commit
```
feat: Initialize project - PRD and X feature specifications
```

## Checklist
- [ ] PRD complete (Vision, Users, Roadmap, Metrics, Constraints, Non-Goals)
- [ ] Features split by Single Responsibility with dependencies
- [ ] All specs created with user stories, AC, edge cases
- [ ] `features/INDEX.md` updated
- [ ] User reviewed and approved
