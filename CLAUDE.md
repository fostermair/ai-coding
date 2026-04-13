# AI Coding Starter Kit

> A Next.js template with an AI-powered development workflow using specialized skills for Requirements, Architecture, Frontend, Backend, QA, and Deployment.

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copy-paste components)
- **Backend:** Supabase (PostgreSQL + Auth + Storage) - optional
- **Deployment:** Vercel
- **Validation:** Zod + react-hook-form
- **State:** React useState / Context API

## Project Structure

```
src/
  app/              Pages (Next.js App Router)
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks
  lib/              Utilities (supabase.ts, utils.ts)
features/           Feature specifications (PROJ-X-name.md)
  INDEX.md          Feature status overview
docs/
  PRD.md            Product Requirements Document
  production/       Production guides (Sentry, security, performance)
```

## Development Workflow

1. `/requirements` - Create feature spec from idea
2. `/architecture` - Design tech architecture (PM-friendly, no code)
3. `/frontend` - Build UI components (shadcn/ui first!)
4. `/backend` - Build APIs, database, RLS policies
5. `/qa` - Test against acceptance criteria + security audit
6. `/deploy` - Deploy to Vercel + production-ready checks

## Feature Tracking

All features tracked in `features/INDEX.md` (pre-loaded below via @-reference — do NOT re-read unless stale). Feature specs live in `features/PROJ-X-name.md`.

## Key Conventions

- **Feature IDs:** PROJ-1, PROJ-2, etc. (sequential)
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description`
- **Single Responsibility:** One feature per spec file
- **shadcn/ui first:** NEVER create custom versions of installed shadcn components
- **Human-in-the-loop:** All workflows have user approval checkpoints
- **Tests:** Unit tests co-located next to source files (`useHook.test.ts` next to `useHook.ts`). E2E tests in `tests/`.

## Build & Test Commands

```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run start        # Production server
npm test             # Vitest unit/integration tests
npm run test:e2e     # Playwright E2E tests
npm run test:all     # Both test suites
```

## Context Recovery (After Compaction)

If your context was compacted mid-task:
1. Re-read the feature spec you're working on
2. Re-read `features/INDEX.md` for current status
3. Run `git diff` to see what you've already changed
4. Continue from where you left off — never restart or duplicate work

## Status Updates (MANDATORY)

After completing work on any feature, follow this exact sequence:
1. **Read** the feature spec and `features/INDEX.md` BEFORE editing
2. **Write** changes using the Edit tool — never just describe changes in chat
3. **Re-read** the file AFTER editing to verify changes are present
4. **If missing**, repeat step 2 — never claim updates without verifying

Valid status flow: Planned → Architected → In Progress → In Review → Approved → Deployed

## File Handling

- ALWAYS read a file before modifying it — never assume contents from memory
- After context compaction, re-read files before continuing work
- Never guess at import paths, component names, or API routes — verify by reading

## Handoffs Between Skills

After completing a skill, suggest the next skill. Format: "Next step: Run `/skillname` to [action]". Handoffs are always user-initiated, never automatic.

## Product Context

@docs/PRD.md

## Feature Overview

@features/INDEX.md
