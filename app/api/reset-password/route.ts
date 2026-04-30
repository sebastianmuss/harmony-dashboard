import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { verifyResetToken } from '@/lib/token'
import { isPasswordValid } from '@/lib/password'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { role, identifier, token, password } = body

  if (!role || !identifier || !token || !password) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!isPasswordValid(password)) {
    return NextResponse.json({
      error: 'Password must be at least 12 characters and include uppercase, lowercase, digit, and special character.',
    }, { status: 400 })
  }

  if (role === 'patient') {
    const patient = await prisma.patient.findUnique({ where: { patientCode: identifier.toUpperCase() } })
    if (!patient?.resetToken || !patient?.resetTokenExpiry) {
      return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 400 })
    }
    if (!verifyResetToken(token, patient.resetToken, patient.resetTokenExpiry)) {
      return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 400 })
    }
    const pin = await bcrypt.hash(password, 12)
    await prisma.patient.update({
      where: { id: patient.id },
      data: { pin, resetToken: null, resetTokenExpiry: null },
    })
    return NextResponse.json({ ok: true })
  }

  if (role === 'provider') {
    const provider = await prisma.provider.findUnique({ where: { username: identifier } })
    if (!provider?.resetToken || !provider?.resetTokenExpiry) {
      return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 400 })
    }
    if (!verifyResetToken(token, provider.resetToken, provider.resetTokenExpiry)) {
      return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 400 })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.provider.update({
      where: { id: provider.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
}
