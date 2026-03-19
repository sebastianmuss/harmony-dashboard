import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ProviderDashboard from './ProviderDashboard'

export default async function ProviderPage() {
  const session = await auth()
  if (!session || !['provider', 'admin'].includes(session.user.role)) redirect('/login')

  return (
    <ProviderDashboard
      providerName={session.user.name ?? ''}
      shiftName={session.user.shiftName ?? 'All Shifts'}
      role={session.user.role as 'provider' | 'admin'}
    />
  )
}
