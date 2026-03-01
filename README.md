# Corp Performance MVP Server

[![CI](https://github.com/guddk1019/test/actions/workflows/ci.yml/badge.svg)](https://github.com/guddk1019/test/actions/workflows/ci.yml)

MVP backend for:
- Employee app (Windows desktop, Electron) -> API upload -> NAS storage
- Admin (Mac) -> browser-based admin API/web

## 1) Stack
- Node.js + Express + TypeScript
- PostgreSQL
- NAS mount path accessed by server only

## 2) Key rules implemented
- Employees never access NAS directly.
- File flow is only `App -> Server -> NAS`.
- Submission version auto-increments (`v001`, `v002`, ...).
- Server writes file metadata (hash, size, NAS path) to DB.
- Audit logs are written for key actions.

## 3) NAS layout
Stored under:

`/corp_perf/{year}/{dept}/{employeeId}/{workItemId}/submissions/v001/`

On finalize, `manifest.json` is written in the same folder.

## 4) Environment
Copy `.env.example` to `.env` and adjust values.
For production, copy `.env.production.example` to `.env.production` and fill real values.

Required:
- `DATABASE_URL`
- `JWT_SECRET`
- `NAS_MOUNT_PATH`

## 5) Run
```bash
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

PowerShell execution policy may block `npm`. In that case use `npm.cmd` (for example `npm.cmd run dev`).

Health check:
`GET http://localhost:4000/health`

## 6) Seed accounts
Defaults from `.env`:
- Admin: `admin001 / Admin1234!`
- Employee: `emp001 / Emp1234!`

## 7) API (MVP)

### Auth
- `POST /api/auth/login`

### Employee app APIs
- `GET /api/work-items/me`
- `POST /api/work-items`
- `GET /api/work-items/:workItemId`
- `GET /api/work-items/:workItemId/change-requests`
- `POST /api/work-items/:workItemId/change-requests`
- `POST /api/work-items/:workItemId/submissions`
- `POST /api/submissions/:submissionId/files` (multipart field: `files`)
- `POST /api/submissions/:submissionId/finalize`
- `GET /api/submissions/:submissionId/status`

### Admin APIs
- `GET /api/admin/work-items`
- `GET /api/admin/change-requests`
- `GET /api/admin/work-items/:workItemId`
- `POST /api/admin/submissions/:submissionId/review`
- `POST /api/admin/change-requests/:changeRequestId/review`

### Migration note
- New migration added: `sql/002_change_requests.sql`
- Run: `npm run db:migrate`

## 8) Status model

Work item status:
- `DRAFT`
- `SUBMITTED`
- `EVALUATING`
- `DONE`
- `REJECTED`

Submission status:
- `UPLOADING`
- `SUBMITTED`
- `EVALUATING`
- `DONE`
- `REJECTED`

## 9) Notes for next phase
- Add `change_requests` table and approval flow.
- Add async AI evaluation queue and `evaluations` table.
- Expand dashboard analytics and notification workflow.

## 10) Automated tests
- API smoke (auto start backend if needed): `npm run test:smoke:api:local`
- Frontend E2E (Playwright): `npm run test:e2e:frontend`
- Release preflight report: `npm run release:preflight` (quick: `npm run release:preflight:quick`)
- NAS mount pre-check: `npm run ops:nas-check`

## 11) Release ops docs
- Release checklist: `.github/release-checklist.md`
- Release notes template: `.github/release-notes-template.md`
- Deployment rehearsal guide: `.github/deployment-rehearsal.md`
- Environment validation: `npm run ops:validate-env` (strict: `npm run ops:validate-env:strict`)
  - Production file: `npm run ops:validate-env:prod`
  - Example production file check: `npm run ops:validate-env:prod:example`
  - Preflight auto-allocates isolated local ports for smoke/E2E checks.

## Security hardening (applied)
- Login rate limiting (`LOGIN_RATE_LIMIT_*`)
- Strict JWT verification (`HS256`, issuer, audience)
- Basic security headers (`X-Frame-Options`, `CSP`, `HSTS` on HTTPS, etc.)
- Stricter input validation (IDs, dates, query length, comment/text length)
- Rejection comment is mandatory for admin reject actions
- Upload guardrails (blocked executable extensions, filename length, empty-file reject)
- Frontend auth cookie minimization (token + role only)

## 12) Frontend app
- Frontend source: `./frontend`
- Frontend local run:
  - `npm --prefix frontend install`
  - `npm --prefix frontend run dev`

## 13) PR operation standard (recommended)
- Open PRs against `main` (or `master`).
- Require CI check `test` to pass before merge.
- Prefer squash merge and delete branch after merge.
- Require at least 1 approval.

Branch protection setup reference:
- `.github/branch-protection.md`

PR template:
- `.github/pull_request_template.md`

Release checklist:
- `.github/release-checklist.md`

## 14) CI badge setup
The badge is configured for `guddk1019/test`.

## 15) Apply branch protection (API)
If you want to apply branch protection without manual UI clicks:

```bash
npm run ops:branch-protect
```

Required environment variable:
- `GITHUB_TOKEN` (or `GH_TOKEN`)
