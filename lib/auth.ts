import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { pinIndexHash, validatePin } from '@/lib/pin'
import logger from '@/lib/logger'

// ── Upsert a shadow AuthUser record for database-session tracking ─────────────
async function upsertAuthUser(data: {
  id: string
  name: string
  email: string | null
  role: string
  patientId?: number | null
  providerId?: number | null
  patientCode?: string | null
  center?: string | null
  shiftId?: number | null
  shiftName?: string | null
  shiftSchedule?: string | null
  dialysisSchedule?: string | null
  customDialysisDays?: string | null
}) {
  await prisma.user.upsert({
    where: { id: data.id },
    create: data,
    update: {
      // Refresh mutable fields on every login so sessions stay current
      name:               data.name,
      role:               data.role,
      center:             data.center ?? null,
      shiftId:            data.shiftId ?? null,
      shiftName:          data.shiftName ?? null,
      shiftSchedule:      data.shiftSchedule ?? null,
      dialysisSchedule:   data.dialysisSchedule ?? null,
      customDialysisDays: data.customDialysisDays ?? null,
    },
  })
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  session: { strategy: 'database', maxAge: 8 * 60 * 60 }, // 8h — one clinical shift
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // ── Provider / Admin login (username + password) ──────────────────────
    CredentialsProvider({
      id: 'provider-login',
      name: 'Provider Login',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const provider = await prisma.provider.findUnique({
          where: { username: credentials.username },
          include: { shift: true },
        })

        if (!provider || !provider.isActive) return null

        const passwordValid = await bcrypt.compare(credentials.password, provider.passwordHash)
        if (!passwordValid) {
          logger.warn({ username: credentials.username }, 'Failed provider login attempt')
          return null
        }

        const userId = `provider-${provider.id}`
        await upsertAuthUser({
          id:             userId,
          name:           provider.name,
          email:          provider.username,
          role:           provider.role,
          providerId:     provider.id,
          center:         provider.center ?? null,
          shiftId:        provider.shiftId ?? null,
          shiftName:      provider.shift?.name ?? null,
          shiftSchedule:  provider.shift?.schedule ?? null,
        })

        return { id: userId, name: provider.name, email: provider.username }
      },
    }),

    // ── Patient login (patientCode + PIN) ────────────────────────────────
    CredentialsProvider({
      id: 'patient-login',
      name: 'Patient PIN Login',
      credentials: {
        patientCode: { label: 'Patientenkennung', type: 'text' },
        pin:         { label: 'PIN', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.pin || !credentials?.patientCode) return null
        const pin = credentials.pin.trim()
        if (!validatePin(pin)) return null

        const indexHash = pinIndexHash(pin)
        const patient = await prisma.patient.findUnique({
          where: { pinIndexHash: indexHash, isActive: true },
          include: { shift: true },
        })

        if (!patient) return null

        const inputCode = credentials.patientCode.trim().toUpperCase()
        if (inputCode !== patient.patientCode.toUpperCase()) return null

        const valid = await bcrypt.compare(pin, patient.pin)
        if (!valid) {
          logger.warn({ patientCode: inputCode }, 'Failed patient login attempt')
          return null
        }

        const userId = `patient-${patient.id}`
        await upsertAuthUser({
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
        })

        return { id: userId, name: patient.patientCode, email: null }
      },
    }),
  ],

  events: {
    async signIn({ user }) {
      const authUser = await prisma.user.findUnique({ where: { id: user.id } })
      if (!authUser) return
      try {
        await prisma.activityLog.create({
          data: {
            eventType: 'login',
            actorType: authUser.role,
            actorId:   authUser.patientId ?? authUser.providerId ?? null,
            center:    authUser.center ?? null,
            shiftId:   authUser.shiftId ?? null,
          },
        })
      } catch { /* non-fatal */ }
    },
  },

  callbacks: {
    // With database sessions, `user` comes from the AuthUser table
    async session({ session, user }) {
      if (session.user) {
        const u = user as typeof user & {
          role: string
          patientId: number | null
          providerId: number | null
          patientCode: string | null
          center: string | null
          shiftId: number | null
          shiftName: string | null
          shiftSchedule: string | null
          dialysisSchedule: string | null
          customDialysisDays: string | null
        }
        const s = session.user as any
        s.role               = u.role
        s.userType           = u.role === 'patient' ? 'patient' : 'provider'
        s.patientId          = u.patientId ?? undefined
        s.providerId         = u.providerId ?? undefined
        s.patientCode        = u.patientCode ?? undefined
        s.center             = u.center ?? null
        s.shiftId            = u.shiftId ?? undefined
        s.shiftName          = u.shiftName ?? undefined
        s.shiftSchedule      = u.shiftSchedule ?? undefined
        s.dialysisSchedule   = u.dialysisSchedule ?? undefined
        s.customDialysisDays = u.customDialysisDays ?? undefined
      }
      return session
    },
  },
}
