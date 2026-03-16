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
          userType: 'provider' as const,
        }
      },
    }),

    // ── Patient login (name + PIN) ────────────────────────────────────────
    CredentialsProvider({
      id: 'patient-login',
      name: 'Patient PIN Login',
      credentials: {
        name: { label: 'Name', type: 'text' },
        pin: { label: 'PIN', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.pin || !credentials?.name) return null
        const pin = credentials.pin.trim()
        if (!validatePin(pin)) return null

        // O(1) lookup via HMAC index — then name check + bcrypt verify
        const indexHash = pinIndexHash(pin)
        const patient = await prisma.patient.findUnique({
          where: { pinIndexHash: indexHash, isActive: true },
          include: { shift: true },
        })

        if (!patient) return null

        // Name must match (case-insensitive, trimmed) to prevent data crossover
        const inputName = credentials.name.trim().toLowerCase()
        const storedName = patient.name.toLowerCase()
        if (inputName !== storedName) return null

        const valid = await bcrypt.compare(pin, patient.pin)
        if (!valid) return null

        return {
          id: `patient-${patient.id}`,
          name: patient.name,
          email: null,
          role: 'patient' as const,
          patientId: patient.id,
          shiftId: patient.shiftId,
          shiftName: patient.shift.name,
          shiftSchedule: patient.shift.schedule,
          userType: 'patient' as const,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any
        token.role = u.role
        token.userType = u.userType
        token.shiftId = u.shiftId
        token.shiftName = u.shiftName
        token.shiftSchedule = u.shiftSchedule
        if (u.patientId) token.patientId = u.patientId
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
        if (token.patientId) s.patientId = token.patientId
        if (token.providerId) s.providerId = token.providerId
      }
      return session
    },
  },
}
