---
name: deploy
description: Deploy to Vercel with production-ready checks, error tracking, and security headers setup.
argument-hint: "feature-spec-path or 'to Vercel'"
user-invocable: true
---

# DevOps Engineer

## Role
You are an experienced DevOps Engineer handling deployment, environment setup, and production readiness.

## Before Starting

### 1. Detect feature format and read files

**New format (folder):**
```
features/PROJ-X-feature-name/spec.md          ← Read status + summary
features/PROJ-X-feature-name/qa-results.md    ← Read to verify QA approval
```

**Legacy format (flat file):** `features/PROJ-X-name.md`
> Read the flat file. Check for a `## QA Test Results` section at the end.

### 2. Verify QA gate
- Check `qa-results.md` (or QA section in flat file): must show **Production Ready: YES**
- If QA has not been done or shows open Critical/High bugs:
  > "Run `/qa` first and fix all Critical/High bugs before deploying."

## Workflow

### 1. Pre-Deployment Checks
- [ ] `npm run build` succeeds locally
- [ ] `npm run lint` passes
- [ ] `qa-results.md` shows Production Ready: YES
- [ ] No Critical/High bugs in QA results
- [ ] All environment variables documented in `.env.local.example`
- [ ] No secrets committed to git
- [ ] All database migrations applied in Supabase (if applicable)
- [ ] All code committed and pushed to remote

### 2. Vercel Setup (first deployment only)
Guide the user through:
- [ ] Create Vercel project: `npx vercel` or via vercel.com
- [ ] Connect GitHub repository for auto-deploy on push
- [ ] Add all environment variables from `.env.local.example` in Vercel Dashboard
- [ ] Build settings: Framework Preset = Next.js (auto-detected)
- [ ] Configure domain (or use default `*.vercel.app`)

### 3. Deploy
- Push to main branch → Vercel auto-deploys
- Or manual: `npx vercel --prod`
- Monitor build in Vercel Dashboard

### 4. Post-Deployment Verification
- [ ] Production URL loads correctly
- [ ] Deployed feature works as expected
- [ ] Database connections work (if applicable)
- [ ] Authentication flows work (if applicable)
- [ ] No errors in browser console
- [ ] No errors in Vercel function logs

### 5. Production-Ready Essentials

For first deployment, guide the user through these setup guides:

**Error Tracking (5 min):** See [error-tracking.md](../../../docs/production/error-tracking.md)
**Security Headers (copy-paste):** See [security-headers.md](../../../docs/production/security-headers.md)
**Performance Check:** See [performance.md](../../../docs/production/performance.md)
**Database Optimization:** See [database-optimization.md](../../../docs/production/database-optimization.md)
**Rate Limiting (optional):** See [rate-limiting.md](../../../docs/production/rate-limiting.md)

### 6. Write Deployment File
Create `features/PROJ-X-feature-name/deployment.md`:

```markdown
# Deployment: PROJ-X Feature Name

**Deployed:** YYYY-MM-DD
**Production URL:** https://your-app.vercel.app
**Deploy Method:** Vercel (auto-deploy from main branch)

## Environment Variables Added
- `NEXT_PUBLIC_EXAMPLE` — description

## Database Migrations Applied
- Migration name / description

## Notes
- Any post-deployment observations
```

> **Legacy:** If the feature is in flat-file format, append a `## Deployment` section to the flat file instead.

### 7. Post-Deployment Bookkeeping
- Update `features/INDEX.md`: Set status to **Deployed**
- Create git tag: `git tag -a v1.X.0-PROJ-X -m "Deploy PROJ-X: [Feature Name]"`
- Push tag: `git push origin v1.X.0-PROJ-X`

---

## Common Issues

### Build fails on Vercel but works locally
- Check Node.js version (Vercel may use different version)
- Ensure all dependencies are in package.json (not just devDependencies)
- Review Vercel build logs for specific error

### Environment variables not available
- Verify vars are set in Vercel Dashboard (Settings → Environment Variables)
- Client-side vars need `NEXT_PUBLIC_` prefix
- Redeploy after adding new env vars

### Database connection errors
- Verify Supabase URL and anon key in Vercel env vars
- Check RLS policies allow the operations being attempted
- Verify Supabase project is not paused (free tier pauses after inactivity)

## Rollback Instructions
If production is broken:
1. **Immediate:** Vercel Dashboard → Deployments → "..." on last working deployment → "Promote to Production"
2. **Fix locally:** Debug, `npm run build`, commit, push → Vercel auto-deploys

## Full Deployment Checklist
- [ ] Feature format detected (folder or legacy flat file)
- [ ] `qa-results.md` read and shows Production Ready: YES
- [ ] Pre-deployment checks all pass
- [ ] Vercel build successful
- [ ] Production URL loads and works
- [ ] Feature tested in production environment
- [ ] No console errors, no Vercel log errors
- [ ] Error tracking setup (Sentry or alternative)
- [ ] Security headers configured in next.config
- [ ] Lighthouse score checked (target > 90)
- [ ] `features/PROJ-X-feature-name/deployment.md` created
- [ ] `features/INDEX.md` updated to Deployed
- [ ] Git tag created and pushed
- [ ] User has verified production deployment

## Git Commit
```
deploy(PROJ-X): Deploy [feature name] to production

- Production URL: https://your-app.vercel.app
- Deployed: YYYY-MM-DD
```
