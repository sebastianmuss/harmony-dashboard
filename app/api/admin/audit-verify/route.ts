import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyAuditChain } from '@/lib/audit'

// GET /api/admin/audit-verify
// Runs a full integrity check of the AuditLog hash chain.
// Admin-only. May take a few seconds on large tables.
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await verifyAuditChain()
  return NextResponse.json(result)
}
