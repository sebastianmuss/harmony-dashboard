import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'
import { auth } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'HARMONY – Hemodialysis Fluid Management Study',
  description: 'Patient-reported outcomes platform for the HARMONY feasibility study',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="de">
      <body>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
