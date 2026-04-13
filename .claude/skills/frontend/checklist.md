# Frontend Checklist (verify before completion)

## shadcn/ui
- [ ] Used shadcn/ui for every standard UI element; no custom duplicates
- [ ] Missing components installed via `npx shadcn@latest add`

## Implementation
- [ ] All components from tech design implemented
- [ ] Tailwind CSS only (no inline styles, no CSS modules)
- [ ] Loading, error, and empty states for all data-driven components
- [ ] Responsive: 375px, 768px, 1440px
- [ ] Semantic HTML + ARIA labels + keyboard navigation

## Verification
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All acceptance criteria addressed in UI
- [ ] User has reviewed and approved in browser

## Tracking
- [ ] `features/INDEX.md` status → "In Progress"
- [ ] Feature spec updated with implementation notes
- [ ] Code committed: `feat(PROJ-X): Implement frontend for [name]`
