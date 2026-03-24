# Changelog

All notable changes to the HARMONY Dashboard are documented here.

## [Unreleased]

## [1.3.0] — 2026-03-24

### Added
- **Tamper-evident audit log**: SHA-256 hash-chaining across all audit entries. Deletion or modification of any row breaks the chain and is detectable via the admin integrity check.
- **Per-patient view logging**: Every provider expansion of a patient's longitudinal data panel is recorded in the audit log (actor, patient, timestamp, IP).
- **Admin audit chain verification**: Button in admin panel to verify full audit chain integrity with a pass/fail report.
- **Recovery time PROM measure**: Patients and providers can now record post-dialysis recovery time (0–2h, 3–6h, 7–12h, >12h) alongside the three existing PROM scores.
- **Same-day PROM editing**: Patients and providers can edit a submitted PROM on the same day it was created.
- **Password complexity requirements**: Provider and admin passwords must be at least 12 characters and include uppercase, lowercase, digit, and special character.
- **Weak PIN rejection**: Patient PINs that are all-repeated or sequential digits (000000, 123456, etc.) are rejected at creation and reset.
- **Last PROM staleness indicator**: Provider and admin views show how long ago each patient last submitted a PROM.

### Fixed
- Audit hash mismatch caused by PostgreSQL `jsonb` reordering keys alphabetically on storage — fixed by using deterministic key-sorted JSON serialisation in hash computation.
- CSV formula injection in export routes — all cell values are now quoted per RFC 4180.
- Missing audit log entry on schedule override creation.

### Changed
- Upgraded to Next.js 16.2.1 and React 19.2.4.
- Replaced `middleware.ts` + `auth.config.ts` split with unified `proxy.ts` (Node.js runtime); removes the Edge Runtime workaround.

## [1.2.0] — 2026-03-20

### Added
- **Deny-by-default middleware**: All routes require authentication unless explicitly public (`/login`, `/api/auth/*`).
- **Session revocation** (`kickedAt`): Admins can instantly invalidate any active session from the Sessions tab.
- **Failed login audit**: All failed authentication attempts are recorded in the audit log.
- **Global error boundary** (`app/error.tsx`): Prevents stack traces leaking to the browser in production.
- **Zod validation** on all POST/PATCH API endpoints.
- **Content-Security-Policy**, Permissions-Policy, and Cross-Origin-Opener-Policy headers via Caddy.
- **PROM trend charts** (LOESS-smoothed) and blood pressure boxplots in the provider view.

### Fixed
- Timezone bug: `setHours` replaced with `setUTCHours` in five date-normalisation sites — CET server was storing PROMs with the previous day's date.
- Cross-center IDOR vulnerability on schedule override DELETE endpoint.
- Provider fallback to `shiftId` when `center` was unset, allowing cross-center data access.
- Prisma version mismatch between CLI (v6) and client package.
- Prisma-in-Edge-Runtime crash: split auth config for middleware.
- Pino `transport` crash in Edge Runtime.

### Changed
- Session lifetime reduced from 8 hours to 2 hours.
- JWT payload minimised to `userId` only; full profile fetched fresh from DB on every request.
- PIN length fixed to exactly 6 digits (was 4–6).

## [1.1.0] — 2026-03-10

### Added
- Admin panel: 8-tab interface covering feasibility metrics, patient management, provider management, study configuration, CSV import/export, usage statistics, trend charts, and session management.
- Provider dashboard: shift patient list with PROM entry, clinical data entry, weight and blood pressure charts, schedule overrides.
- Patient PROM form: large-touch German-language interface with school-grade scale (1–5).
- Audit log with append-only semantics for all data-modifying operations.
- Activity log tracking logins, PROM submissions, and data views.
- Center-scoped data access for multi-site support.
- Soft-delete for patients (deactivation, not destruction).
- Demo seed script with 120 patients, 5 shifts, 7 providers.

## [1.0.0] — 2026-02-01

### Added
- Initial application: dual-mode authentication (patient PIN / provider credentials), study week and timepoint calculation, basic PROM submission and clinical data entry.
