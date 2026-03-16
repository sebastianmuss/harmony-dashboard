import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const role = session.user.role
  if (role === 'patient') redirect('/patient')
  if (role === 'admin') redirect('/admin')
  if (role === 'provider') redirect('/provider')

  redirect('/login')
}
