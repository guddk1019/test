# Deployment Rehearsal (Dev)

This is a dry-run checklist for personal/dev environments before future NAS production rollout.

## 1) Baseline
1. Confirm branch/tag:
   - `git branch --show-current`
   - `git tag --list`
2. Confirm env files:
   - `.env` exists for dev
   - `.env.production` exists only locally (not tracked)

## 2) Quality Gate
1. Run NAS access check:
   - `npm run ops:nas-check`
2. Run full preflight:
   - `npm run release:preflight`
3. Save evidence:
   - `.github/release-evidence/latest-preflight.md`

## 3) DB / Migration
1. `npm run db:migrate`
2. `npm run db:seed` (only when needed)
3. Verify API health:
   - `GET http://localhost:4000/health`

## 4) Flow Verification
1. Employee flow: login -> create work item -> submit file
2. Admin flow: queue -> review -> approve/reject
3. Change request flow: request -> admin review -> linked submission

## 5) Release Note Draft
1. Copy `.github/release-notes-template.md`
2. Fill verification links and rollback notes

## 6) Future Production Note
- Replace localhost values with real DB/NAS/domain values in `.env.production`
- Re-run strict checks before production:
  - `npm run ops:validate-env:prod` (when this script is available in branch)
