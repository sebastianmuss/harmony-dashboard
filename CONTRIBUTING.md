# Contributing

This is a closed research project. External contributions are not accepted during the active study period (2025–2026). This document is intended for collaborators who have been granted access by the principal investigator.

## Development Environment

### Requirements

- Node.js ≥ 20
- PostgreSQL ≥ 14
- Git

### Setup

```bash
git clone <repo-url>
cd harmony-dashboard
npm install
cp .env.example .env.local   # fill in DATABASE_URL and NEXTAUTH_SECRET
npx prisma generate
npx prisma db push
npm run db:seed               # optional: load demo data
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random ≥ 32 character string — used for JWT signing and PIN HMAC |
| `NEXTAUTH_URL` | Base URL of the app |

Generate a secret with: `openssl rand -base64 32`

---

## Project Structure

```
app/
  api/              API route handlers (Next.js Route Handlers)
  admin/            Admin panel page + component
  patient/          Patient PROM entry page + component
  provider/         Provider shift dashboard page + component
  login/            Login page
  layout.tsx        Root layout
  page.tsx          Root redirect (role-based routing)
lib/
  auth.ts           NextAuth configuration, login providers, JWT/session callbacks
  audit.ts          Audit log writer (hash-chained, fire-and-forget)
  db.ts             Prisma singleton
  study.ts          Study week + timepoint calculation logic
  pin.ts            PIN validation and HMAC index hash
  logger.ts         Pino structured logger
  loess.ts          LOESS smoothing for trend charts
  boxplot.ts        Boxplot computation for blood pressure charts
prisma/
  schema.prisma     Database schema
scripts/
  seed.ts           Demo data seed script
proxy.ts            Next.js middleware (deny-by-default auth, rate limiting)
```

---

## Code Conventions

### Security-sensitive code

- All API routes must call `auth()` as the very first statement
- Role checks come immediately after: `if (!session || session.user.role !== 'admin')`
- Providers must always be center-scoped: check `patient.center === session.user.center`
- Never log or include passwords, PINs, or `NEXTAUTH_SECRET` in audit records or log output
- All data-modifying operations must call `writeAudit()`
- All API inputs must be validated with a Zod schema before use

### Dates

Always use `setUTCHours(0, 0, 0, 0)` (not `setHours`) when normalising dates to midnight. The server runs in CET/CEST; using local time causes off-by-one date bugs.

### Database

- Use Prisma's typed query builder exclusively — no raw SQL except where explicitly required
- Do not add `$queryRaw` or `$executeRaw` without a documented justification
- Schema changes: edit `prisma/schema.prisma`, then run `npx prisma db push` (dev) or `npx prisma migrate dev` (if migrations are needed)

### Audit logging

Every route that modifies data must call `writeAudit()`. The `changes` field must never include passwords, PIN hashes, or `NEXTAUTH_SECRET`. `writeAudit` is fire-and-forget — it never throws and must not interrupt the user-facing response.

---

## Making Changes

1. Create a branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test locally against a real PostgreSQL database (not mocked)
4. Commit with a descriptive message explaining *why*, not just *what*
5. Open a pull request against `main` for review by the PI

---

## Deployment

Deployment is manual:

```bash
# On the production server
cd /path/to/harmony-dashboard
git pull
npm install
npm run build
pm2 restart harmony   # or equivalent process manager command
```

If the Prisma schema changed:
```bash
npx prisma db push    # before npm run build
```

Do not run `npm run db:seed` on production — it wipes all data.
