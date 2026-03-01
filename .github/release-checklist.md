# Release Checklist (Pre-deploy)

Use this checklist before every production release.

## 1) Scope and freeze
- [ ] PR scope is finalized and reviewed.
- [ ] No pending high-severity bug in current milestone.
- [ ] Release owner and rollback owner are assigned.

## 2) Build and tests
- [ ] Backend build: `npm run build`
- [ ] Frontend lint: `npm --prefix frontend run lint`
- [ ] Frontend build: `npm --prefix frontend run build`
- [ ] API smoke: `npm run test:smoke:api:local`
- [ ] Frontend E2E: `npm run test:e2e:frontend`

## 3) DB and storage safety
- [ ] DB backup created (timestamp recorded).
- [ ] NAS backup snapshot created (timestamp recorded).
- [ ] Migration scripts reviewed.
- [ ] `npm run db:migrate` dry-run/validation completed in staging.

## 4) Environment validation
- [ ] Production `.env` checked (JWT, CORS, NAS mount, DB URL).
- [ ] `CORS_ORIGIN` is production domain only.
- [ ] `JWT_SECRET` is rotated/managed securely.
- [ ] `UPLOAD_BLOCKED_EXTENSIONS` policy confirmed.

## 5) Deployment steps
- [ ] Deploy backend artifact.
- [ ] Run migration: `npm run db:migrate`
- [ ] Run seed only if required by plan: `npm run db:seed`
- [ ] Deploy frontend artifact.
- [ ] Restart services and verify health endpoint.

## 6) Post-deploy verification
- [ ] `GET /health` returns `{ ok: true }`.
- [ ] Employee flow works: login -> create work item -> submit.
- [ ] Admin flow works: queue -> review -> status update.
- [ ] File upload is stored on NAS and metadata exists in DB.
- [ ] Audit logs are being recorded.

## 7) Rollback readiness
- [ ] Rollback trigger criteria documented.
- [ ] Previous backend/frontend artifacts available.
- [ ] DB rollback strategy defined (forward fix or restore point).
- [ ] Incident communication channel prepared.

## 8) Release record
- Release date/time:
- Release version/tag:
- Release owner:
- Validation evidence links:
