import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      role: 'patient' | 'provider' | 'admin'
      userType: 'patient' | 'provider'
      shiftId?: number
      shiftName?: string
      shiftSchedule?: string
      patientId?: number
      patientCode?: string
      dialysisSchedule?: string
      customDialysisDays?: string | null
      center?: string | null
      providerId?: number
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    // Minimal payload — only the user ID is stored in the cookie.
    // All profile data is fetched fresh from the DB in the session callback.
    userId?: string
  }
}
