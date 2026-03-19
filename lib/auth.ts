import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { pinIndexHash, validatePin } from '@/lib/pin'
import logger from '@/lib/logger'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT is required for CredentialsProvider (Auth.js constraint).
  // Session revocation is implemented via kickedAt: the jwt callback
  // checks the DB on every request and invalidates the token if the user
  // was kicked after the token was issued.
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h — one clinical shift
  pages: { signIn: '/login', error: '/login' },

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
        if (inputCode !== patient.patientCode.toUpperCase()) return null

        const valid = await bcrypt.compare(pin, patient.pin)
        if (!valid) {
          logger.warn({ patientCode: inputCode }, 'Failed patient login attempt')
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
        // First sign-in: load full profile from auth_users into the token
        const dbUser = await prisma.user.findUnique({ where: { id: user.id! } })
        if (!dbUser) return token
        token.userId             = dbUser.id
        token.role               = dbUser.role as 'patient' | 'provider' | 'admin'
        token.userType           = dbUser.role === 'patient' ? 'patient' : 'provider'
        token.center             = dbUser.center ?? null
        token.shiftId            = dbUser.shiftId ?? undefined
        token.shiftName          = dbUser.shiftName ?? undefined
        token.shiftSchedule      = dbUser.shiftSchedule ?? undefined
        token.patientId          = dbUser.patientId ?? undefined
        token.patientCode        = dbUser.patientCode ?? undefined
        token.dialysisSchedule   = dbUser.dialysisSchedule ?? undefined
        token.customDialysisDays = dbUser.customDialysisDays ?? undefined
        token.providerId         = dbUser.providerId ?? undefined
      } else if (token.userId) {
        // Subsequent requests: check if admin has kicked this user
        const dbUser = await prisma.user.findUnique({
          where:  { id: token.userId as string },
          select: { kickedAt: true },
        })
        if (dbUser?.kickedAt && dbUser.kickedAt > new Date((token.iat as number) * 1000)) {
          // Kicked after token was issued — invalidate the session
          return null as any
        }
      }
      return token
    },

    async session({ session, token }) {
      session.user.id              = token.userId as string
      session.user.role            = token.role as 'patient' | 'provider' | 'admin'
      session.user.userType        = token.userType as 'patient' | 'provider'
      session.user.center          = token.center as string | null
      session.user.shiftId         = token.shiftId as number | undefined
      session.user.shiftName       = token.shiftName as string | undefined
      session.user.shiftSchedule   = token.shiftSchedule as string | undefined
      if (token.patientId)                        session.user.patientId          = token.patientId as number
      if (token.patientCode)                      session.user.patientCode        = token.patientCode as string
      if (token.dialysisSchedule)                 session.user.dialysisSchedule   = token.dialysisSchedule as string
      if (token.customDialysisDays !== undefined) session.user.customDialysisDays = token.customDialysisDays as string | null
      if (token.providerId)                       session.user.providerId         = token.providerId as number
      return session
    },
  },
})
