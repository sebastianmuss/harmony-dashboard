import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminPanel from './AdminPanel'

export default async function AdminPage() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') redirect('/login')

  return <AdminPanel adminName={session.user.name ?? ''} adminUserId={session.user.id} />
}
