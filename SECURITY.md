# Security Policy

## Scope

This document covers the HARMONY Dashboard application — a clinical research web application handling pseudonymised patient data from a hemodialysis feasibility study. Because the application processes health-related research data, security vulnerabilities are treated with high priority.

## Supported Versions

Only the current version on the `main` branch is actively maintained. There are no legacy release branches.

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues.**

Contact the principal investigator directly by email. Include:

1. A description of the vulnerability and the component affected
2. Steps to reproduce (proof of concept where possible)
3. Potential impact assessment
4. Your suggested fix or mitigation, if any

You will receive an acknowledgement within 48 hours and a resolution timeline within 5 business days. We ask that you allow reasonable time for a fix to be deployed before any public disclosure (coordinated disclosure).

## Security Architecture

### Authentication

- Patients authenticate with a pseudonymous study code and a 6-digit PIN (bcrypt, cost 12)
- Providers and admins authenticate with a username and password (bcrypt, cost 12; minimum 12 characters, complexity enforced)
- All sessions are JWT-based with a 2-hour lifetime
- Sessions can be revoked instantly by an admin via the `kickedAt` mechanism
- Login attempts are rate-limited to 10 per IP per 15-minute window

### Authorisation

- All routes are deny-by-default — authentication is required unless a route is explicitly public
- Three roles: `patient`, `provider`, `admin`
- Providers are scoped to a single centre and cannot access data from other centres
- Patients can only access their own data

### Data Protection

- No direct patient identifiers (name, date of birth, insurance number) are stored in the application
- Patients are identified solely by a pseudonymous study code (HMY-XXXX)
- PINs are stored as bcrypt hashes; a separate HMAC-SHA256 index hash (keyed with `NEXTAUTH_SECRET`) enables O(1) login lookup without storing the PIN in recoverable form
- Passwords are never logged or included in audit records

### Audit Trail

- All data-modifying operations (create, update, delete, export, import) are recorded in an append-only audit log
- Each audit entry is SHA-256 hash-chained to its predecessor — deletion or modification of any entry breaks the chain and is detectable
- Failed login attempts are logged
- Every provider access to a patient's longitudinal data is logged individually
- The audit chain integrity can be verified at any time via the admin panel

### Transport Security

- All traffic is served over HTTPS (TLS 1.2+) enforced by Caddy
- HTTP Strict Transport Security (HSTS) with 1-year max-age is set
- Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and Cross-Origin-Opener-Policy headers are enforced

### Infrastructure

- Application data is hosted on a dedicated server within the EU
- The Next.js process runs unprivileged on port 3000 behind Caddy on port 443
- Environment variables (database credentials, JWT secret) are stored outside the repository in `.env.local`

## Known Limitations

- Rate limiting is implemented in-process (in-memory). A server restart resets the counter. For production hardening beyond the study period, consider moving rate limiting to the Caddy layer or a Redis-backed store.
- JWT sessions cannot be invalidated server-side without the `kickedAt` mechanism. Admins should use the Sessions tab to revoke access when a device is lost or a staff member leaves.

## GDPR / DSGVO

This application was designed with GDPR compliance as a requirement. Relevant measures:

- **Art. 5(1)(f) — integrity and confidentiality:** encryption in transit, access control, audit logging
- **Art. 5(2) — accountability:** tamper-evident audit trail
- **Art. 25 — data protection by design:** pseudonymisation, minimal data collection, deny-by-default access
- **Art. 30 — records of processing:** audit and activity logs
- **Art. 32 — security of processing:** bcrypt hashing, rate limiting, session management

For questions relating to data protection or to exercise data subject rights, contact the study's designated data protection officer.
