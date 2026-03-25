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
      <body className="flex flex-col min-h-screen">
        <SessionProvider session={session}>
          <div className="flex-1">{children}</div>
        </SessionProvider>
        <footer className="border-t border-slate-200 bg-white/60 py-4 px-8 text-center text-xs text-slate-400">
          HARMONY Study · 2026
        </footer>
      </body>
    </html>
  )
}
