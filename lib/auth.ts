import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { pinIndexHash, validatePin } from '@/lib/pin'
import logger from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { authConfig } from '../auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  trustHost: true, // required when behind a reverse proxy (Caddy, nginx, etc.)
  // JWT is required for CredentialsProvider (Auth.js constraint).
  // Session revocation is implemented via kickedAt: the jwt callback
  // checks the DB on every request and invalidates the token if the user
  // was kicked after the token was issued.

  providers: [
    // ── Provider / Admin login (username + password) ──────────────────────
    Credentials({
      id: 'provider-login',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const provider = await prisma.provider.findUnique({
          where: { username: credentials.username as string },
          include: { shift: true },
        })
        if (!provider || !provider.isActive) return null

        const passwordValid = await bcrypt.compare(credentials.password as string, provider.passwordHash)
        if (!passwordValid) {
          logger.warn({ username: credentials.username }, 'Failed provider login attempt')
          writeAudit({ actorType: 'provider', actorId: null, action: 'failed_login', resource: 'auth', resourceId: null, changes: { username: credentials.username }, ip: null })
          return null
        }

        const userId = `provider-${provider.id}`

        // Upsert into auth_users and clear any previous kick
        await prisma.user.upsert({
          where: { id: userId },
          create: {
            id:            userId,
            name:          provider.name,
            email:         provider.username,
            role:          provider.role,
            providerId:    provider.id,
            center:        provider.center ?? null,
            shiftId:       provider.shiftId ?? null,
            shiftName:     provider.shift?.name ?? null,
            shiftSchedule: provider.shift?.schedule ?? null,
          },
          update: {
            name:          provider.name,
            role:          provider.role,
            center:        provider.center ?? null,
            shiftId:       provider.shiftId ?? null,
            shiftName:     provider.shift?.name ?? null,
            shiftSchedule: provider.shift?.schedule ?? null,
            kickedAt:      null, // clear any previous kick on fresh login
          },
        })

        return { id: userId }
      },
    }),

    // ── Patient login (patientCode + PIN) ─────────────────────────────────
    Credentials({
      id: 'patient-login',
      credentials: {
        patientCode: { label: 'Patientenkennung', type: 'text' },
        pin:         { label: 'PIN', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.pin || !credentials?.patientCode) return null
        const pin = (credentials.pin as string).trim()
        if (!validatePin(pin)) return null

        const indexHash = pinIndexHash(pin)
        const patient = await prisma.patient.findUnique({
          where: { pinIndexHash: indexHash, isActive: true },
          include: { shift: true },
        })
        if (!patient) return null

        const inputCode = (credentials.patientCode as string).trim().toUpperCase()
        const expectedCode = patient.patientCode.toUpperCase()
        // Constant-time comparison to prevent timing attacks that enumerate valid codes
        const codeMatch =
          inputCode.length === expectedCode.length &&
          timingSafeEqual(Buffer.from(inputCode), Buffer.from(expectedCode))

        const valid = await bcrypt.compare(pin, patient.pin)
        if (!codeMatch || !valid) {
          logger.warn({ patientCode: inputCode }, 'Failed patient login attempt')
          writeAudit({ actorType: 'patient', actorId: null, action: 'failed_login', resource: 'auth', resourceId: null, changes: { patientCode: inputCode }, ip: null })
          return null
        }

        const userId = `patient-${patient.id}`

        // Upsert into auth_users and clear any previous kick
        await prisma.user.upsert({
          where: { id: userId },
          create: {
            id:                 userId,
            name:               patient.patientCode,
            email:              null,
            role:               'patient',
            patientId:          patient.id,
            patientCode:        patient.patientCode,
            center:             patient.center,
            shiftId:            patient.shiftId,
            shiftName:          patient.shift.name,
            shiftSchedule:      patient.shift.schedule,
            dialysisSchedule:   patient.dialysisSchedule,
            customDialysisDays: patient.customDialysisDays ?? null,
          },
          update: {
            name:               patient.patientCode,
            role:               'patient',
            center:             patient.center,
            shiftId:            patient.shiftId,
            shiftName:          patient.shift.name,
            shiftSchedule:      patient.shift.schedule,
            dialysisSchedule:   patient.dialysisSchedule,
            customDialysisDays: patient.customDialysisDays ?? null,
            kickedAt:           null, // clear any previous kick on fresh login
          },
        })

        return { id: userId }
      },
    }),
  ],

  events: {
    async signIn({ user }) {
      try {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id! } })
        await prisma.activityLog.create({
          data: {
            eventType: 'login',
            actorType: dbUser?.role ?? 'patient',
            actorId:   dbUser?.patientId ?? dbUser?.providerId ?? null,
            center:    dbUser?.center ?? null,
            shiftId:   dbUser?.shiftId ?? null,
          },
        })
      } catch { /* non-fatal */ }
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: store only the user ID in the token.
        // All profile data is fetched fresh from the DB in the session callback.
        token.userId = user.id
      } else if (token.userId) {
        // Subsequent requests: check if admin has kicked this user.
        const dbUser = await prisma.user.findUnique({
          where:  { id: token.userId as string },
          select: { kickedAt: true },
        })
        if (dbUser?.kickedAt && dbUser.kickedAt >= new Date((token.iat as number) * 1000)) {
          return null as any
        }
      }
      return token
    },

    async session({ session, token }) {
      // Fetch fresh profile on every session read — keeps JWT payload minimal
      // (only userId lives in the cookie) and ensures role/center changes
      // take effect on the next request without requiring a re-login.
      if (!token.userId) return session
      const dbUser = await prisma.user.findUnique({ where: { id: token.userId as string } })
      if (!dbUser) return session

      session.user.id              = dbUser.id
      session.user.role            = dbUser.role as 'patient' | 'provider' | 'admin'
      session.user.userType        = dbUser.role === 'patient' ? 'patient' : 'provider'
      session.user.center          = dbUser.center ?? null
      session.user.shiftId         = dbUser.shiftId ?? undefined
      session.user.shiftName       = dbUser.shiftName ?? undefined
      session.user.shiftSchedule   = dbUser.shiftSchedule ?? undefined
      if (dbUser.patientId)                        session.user.patientId          = dbUser.patientId
      if (dbUser.patientCode)                      session.user.patientCode        = dbUser.patientCode
      if (dbUser.dialysisSchedule)                 session.user.dialysisSchedule   = dbUser.dialysisSchedule
      if (dbUser.customDialysisDays !== undefined) session.user.customDialysisDays = dbUser.customDialysisDays
      if (dbUser.providerId)                       session.user.providerId         = dbUser.providerId
      return session
    },
  },
})
