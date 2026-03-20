import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// ── In-memory rate limiter for login endpoint ────────────────────────────────
const WINDOW_MS    = 15 * 60 * 1000
const MAX_ATTEMPTS = 10
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

// Prune expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (now > val.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

// auth() wraps our middleware and runs the `authorized` callback in auth.ts
// first — that is where deny-by-default is enforced. This inner function
// runs only if `authorized` returned true (i.e. the request is allowed).
export default auth(function middleware(req) {
  // Rate-limit the credentials login endpoint
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
        { status: 429, headers: { 'Retry-After': '900' } },
      )
    }
  }

  return NextResponse.next()
})

// Run on every request except static assets and Next.js internals
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
