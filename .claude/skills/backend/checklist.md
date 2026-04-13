# Backend Checklist (verify before completion)

## Database
- [ ] Tables created with RLS enabled on ALL
- [ ] RLS policies for SELECT, INSERT, UPDATE, DELETE
- [ ] Indexes on WHERE/ORDER BY/JOIN columns
- [ ] Foreign keys with appropriate ON DELETE behavior

## API Routes
- [ ] All endpoints in `/src/app/api/` with auth checks
- [ ] Zod validation on all POST/PUT
- [ ] Meaningful errors with correct HTTP status codes
- [ ] No hardcoded secrets

## Integration
- [ ] Frontend connected to real API endpoints
- [ ] Integration tests written and passing (`npm test`)

## Verification
- [ ] `npm run build` passes
- [ ] All acceptance criteria addressed
- [ ] User has reviewed and approved

## Tracking
- [ ] `features/INDEX.md` status → "In Progress"
- [ ] Feature spec updated with implementation notes
- [ ] Code committed: `feat(PROJ-X): Implement backend for [name]`
