import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HomeContent from './HomeContent'

export default async function RootPage() {
  const session = await auth()

  if (session) {
    const role = session.user.role
    if (role === 'patient')  redirect('/patient')
    if (role === 'admin')    redirect('/admin')
    if (role === 'provider') redirect('/provider')
  }

  return <HomeContent />
}
