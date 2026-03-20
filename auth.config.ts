import type { NextAuthConfig } from 'next-auth'

// Edge-safe auth config — no Prisma, no Node.js-only imports.
// Used by middleware.ts (Edge Runtime) to verify sessions.
// The full config with Prisma is in lib/auth.ts (Node.js only).
export const authConfig = {
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 2 * 60 * 60 },
  providers: [], // populated in lib/auth.ts

  callbacks: {
    // Deny by default: every route requires a valid session unless explicitly public.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const path = nextUrl.pathname

      const isPublic =
        path === '/login' ||
        path.startsWith('/api/auth/')

      if (isPublic) return true

      if (!isLoggedIn) {
        if (path.startsWith('/api/')) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return false // NextAuth redirects to /login
      }

      return true
    },
  },
} satisfies NextAuthConfig
