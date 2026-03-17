import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { pinIndexHash, validatePin } from '@/lib/pin'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
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
        if (!passwordValid) return null

        return {
          id: `provider-${provider.id}`,
          name: provider.name,
          email: provider.username,
          role: provider.role as 'admin' | 'provider',
          providerId: provider.id,
          shiftId: provider.shiftId ?? undefined,
          shiftName: provider.shift?.name ?? undefined,
          center: provider.center ?? null,
          userType: 'provider' as const,
        }
      },
    }),

    // ── Patient login (patientCode + PIN) ────────────────────────────────
    CredentialsProvider({
      id: 'patient-login',
      name: 'Patient PIN Login',
      credentials: {
        patientCode: { label: 'Patientenkennung', type: 'text' },
        pin: { label: 'PIN', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.pin || !credentials?.patientCode) return null
        const pin = credentials.pin.trim()
        if (!validatePin(pin)) return null

        // O(1) lookup via HMAC index — then patientCode check + bcrypt verify
        const indexHash = pinIndexHash(pin)
        const patient = await prisma.patient.findUnique({
          where: { pinIndexHash: indexHash, isActive: true },
          include: { shift: true },
        })

        if (!patient) return null

        // patientCode must match (case-insensitive, trimmed) to prevent data crossover
        const inputCode = credentials.patientCode.trim().toUpperCase()
        const storedCode = patient.patientCode.toUpperCase()
        if (inputCode !== storedCode) return null

        const valid = await bcrypt.compare(pin, patient.pin)
        if (!valid) return null

        return {
          id: `patient-${patient.id}`,
          name: patient.patientCode,
          email: null,
          role: 'patient' as const,
          patientId: patient.id,
          patientCode: patient.patientCode,
          shiftId: patient.shiftId,
          shiftName: patient.shift.name,
          shiftSchedule: patient.shift.schedule,
          dialysisSchedule: patient.dialysisSchedule,
          customDialysisDays: patient.customDialysisDays ?? null,
          center: patient.center,
          userType: 'patient' as const,
        }
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      const u = user as any
      try {
        await prisma.activityLog.create({
          data: {
            eventType: 'login',
            actorType: u.role ?? 'patient',
            actorId: u.patientId ?? u.providerId ?? null,
            center: u.center ?? null,
            shiftId: u.shiftId ?? null,
          },
        })
      } catch { /* non-fatal */ }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any
        token.role = u.role
        token.userType = u.userType
        token.shiftId = u.shiftId
        token.shiftName = u.shiftName
        token.shiftSchedule = u.shiftSchedule
        token.center = u.center ?? null
        if (u.patientId) token.patientId = u.patientId
        if (u.patientCode) token.patientCode = u.patientCode
        if (u.dialysisSchedule) token.dialysisSchedule = u.dialysisSchedule
        if (u.customDialysisDays !== undefined) token.customDialysisDays = u.customDialysisDays
        if (u.providerId) token.providerId = u.providerId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const s = session.user as any
        s.role = token.role
        s.userType = token.userType
        s.shiftId = token.shiftId
        s.shiftName = token.shiftName
        s.shiftSchedule = token.shiftSchedule
        s.center = token.center ?? null
        if (token.patientId) s.patientId = token.patientId
        if (token.patientCode) s.patientCode = token.patientCode
        if (token.dialysisSchedule) s.dialysisSchedule = token.dialysisSchedule
        if (token.customDialysisDays !== undefined) s.customDialysisDays = token.customDialysisDays
        if (token.providerId) s.providerId = token.providerId
      }
      return session
    },
  },
}
