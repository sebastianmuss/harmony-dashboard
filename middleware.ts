import { NextRequest, NextResponse } from 'next/server'

// ── In-memory rate limiter ───────────────────────────────────────────────────
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

setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (now > val.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export function middleware(req: NextRequest) {
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
        { status: 429, headers: { 'Retry-After': '900' } }
      )
    }
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/auth/:path*' }
