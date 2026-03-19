import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ── GET /api/shifts ───────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shifts = await prisma.shift.findMany({
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(shifts)
}
