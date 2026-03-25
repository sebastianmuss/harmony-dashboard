# HARMONY Dashboard

Clinical research web application for the HARMONY feasibility study — a 12-week investigation of fluid management in hemodialysis patients at an Austrian dialysis centre.

## Overview

The HARMONY Dashboard supports three user groups across the study:

- **Patients** log patient-reported outcome measures (PROMs) at each dialysis session via a large-touch PIN-authenticated interface in German.
- **Providers** (nursing staff / physicians) view their shift's patient list, enter clinical measurements, and support PROM data entry on behalf of patients.
- **Admins** (principal investigator / study coordinator) manage patients and providers, configure the study, monitor feasibility metrics, and export research data.

All data are stored in pseudonymised form. Patients are identified only by a study code (HMY-XXXX); no names, dates of birth, or other direct identifiers are held in the application.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, full-stack) |
| Database | PostgreSQL via Prisma ORM v6 |
| Authentication | NextAuth v5 (JWT, CredentialsProvider) |
| UI | React 19, Tailwind CSS v3, Recharts |
| Validation | Zod v4 |
| Logging | Pino (structured JSON) |
| Reverse proxy | Caddy (TLS, security headers) |
| Hosting | Hetzner Cloud (EU) |

---

## Architecture

```
Browser
  │
  ▼
Caddy (port 443)
  │  TLS termination, security headers, gzip
  ▼
Next.js (port 3000)
  │  App Router: server components + API routes
  ├─ /login           — dual-mode login (PIN pad / credentials)
  ├─ /patient         — PROM entry (patient role)
  ├─ /provider        — shift dashboard (provider / admin role)
  ├─ /admin           — study management (admin role)
  └─ /api/*           — JSON API (role-scoped, Zod-validated)
       │
       ▼
  PostgreSQL (Prisma ORM)
```

**Authentication flow:**
1. Credentials submitted to `/api/auth/callback/*`
2. `lib/auth.ts` validates against `providers` or `patients` table
3. On success, a signed encrypted JWT cookie is issued (2-hour lifetime)
4. Every subsequent request passes through `proxy.ts`, which verifies the JWT before the request reaches any route
5. API routes additionally check role and center authorization

---

## Security Features

- **Deny-by-default middleware** — every route requires authentication unless explicitly public
- **Role-based access control** — patient / provider / admin with strict separation
- **Center-scoped data access** — providers can only read and write data for patients at their assigned centre
- **Timing-safe login** — `crypto.timingSafeEqual` for patient code comparison; bcrypt (cost 12) for all passwords and PINs
- **Rate limiting** — 10 login attempts per IP per 15 minutes
- **Session revocation** — admin can invalidate any active session instantly via `kickedAt`
- **Tamper-evident audit log** — SHA-256 hash-chained append-only record of all data mutations; chain integrity verifiable at any time
- **Per-patient view logging** — every provider access to a patient's longitudinal data is recorded
- **Failed login audit** — all failed authentication attempts are logged
- **Input validation** — Zod schemas on all API endpoints
- **CSP / security headers** — enforced at the Caddy layer
- **PIN security** — weak PINs (sequential, repeated digits) rejected at creation

---

## GDPR / DSGVO Compliance Features

- Pseudonymisation by design (HMY-XXXX codes, no direct identifiers)
- Append-only, hash-chained audit trail (Art. 5(2) accountability)
- Per-patient access logging (Art. 32 — appropriate technical measures)
- Soft-delete only — patient records are deactivated, not destroyed, preserving audit integrity
- Export restricted to admin role; every export is logged
- Data hosted within the EU (Hetzner, Germany)
- Session lifetime limited to 2 hours

---

## Local Development Setup

### Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14
- A `.env.local` file (see `.env.example`)

### Steps

```bash
git clone <repo-url>
cd harmony-dashboard
npm install
npx prisma generate
npx prisma db push          # create tables
npm run db:seed             # load demo data (optional)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo credentials (after seeding):**

| Role | Username | Password / PIN |
|------|----------|----------------|
| Admin | `admin` | `harmony-admin-2024` |
| Provider | `provider1` – `provider5` | `harmony-staff-2024` |
| Patient | any HMY-XXXX code | 6-digit PIN (set via Admin panel) |

> **Warning:** Change all passwords immediately on any non-local deployment. The seed passwords above are public knowledge.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret ≥ 32 chars — used for JWT signing and PIN HMAC |
| `NEXTAUTH_URL` | Public base URL of the app (e.g. `https://harmony-app.at`) |

---

## Database Schema (summary)

| Table | Purpose |
|-------|---------|
| `patients` | Pseudonymised patient records with bcrypt PIN and HMAC index |
| `providers` | Staff accounts with bcrypt password |
| `shifts` | 5 fixed dialysis shifts (MWF / TThS × morning / noon / evening) |
| `prom_responses` | Patient-reported outcomes (3 × 1–5 scores + recovery time) |
| `clinical_data` | Weight, IDWG, blood pressure per session |
| `study_config` | Single-row study start date (drives week / timepoint logic) |
| `audit_logs` | Hash-chained append-only audit trail |
| `activity_logs` | Login, PROM submission, and data-view event counts |
| `auth_users` | NextAuth session table (JWT metadata only) |

---

## Scripts

```bash
npm run dev          # development server (Turbopack)
npm run build        # production build
npm run start        # production server
npm run db:push      # apply schema changes to DB
npm run db:seed      # seed demo data
npm run db:studio    # open Prisma Studio (DB browser)
```

---

## Study Logic

Study weeks 1–12 are calculated from `studyStartDate`. Each week has a fixed timepoint reference:

| Weeks | Timepoint |
|-------|-----------|
| 1, 4, 7, 10 | `yesterday` |
| 2, 5, 8, 11 | `arrival` |
| 3, 6, 9, 12 | `now` |

Long-gap sessions (MWF Monday, TThS Tuesday — two days since last dialysis) are automatically flagged.

---

## License

This software was developed for the HARMONY feasibility study. It may not be copied, distributed, or used for commercial purposes without explicit written permission from the principal investigator.
