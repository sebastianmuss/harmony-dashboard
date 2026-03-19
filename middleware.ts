import { NextRequest, NextResponse } from 'next/server'

// ── In-memory rate limiter (single-process / single-server deployment) ────────
// Limits credential login attempts per IP to prevent PIN brute-force.
// Resets automatically after WINDOW_MS. Safe for Docker single-instance.

const WINDOW_MS   = 15 * 60 * 1000  // 15 minutes
const MAX_ATTEMPTS = 10              // per window per IP

const store = new Map<string, { count: number; resetAt: number }>()

function allow(ip: string): boolean {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.count >= MAX_ATTEMPTS) return false

  entry.count++
  return true
}

// Periodically prune expired entries to avoid memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (now > val.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export function middleware(req: NextRequest) {
  // Only rate-limit credential login POSTs
  if (
    req.method === 'POST' &&
    req.nextUrl.pathname === '/api/auth/callback/credentials'
  ) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    if (!allow(ip)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': '900',
            'Content-Type': 'application/json',
          },
        }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/auth/:path*',
}
