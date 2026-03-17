import 'next-auth'
import 'next-auth/jwt'

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
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
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
  }
}
