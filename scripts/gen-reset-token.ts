/**
 * Generate a one-time password reset token for any provider (including admin)
 * directly in the database — no login required.
 *
 * Usage:
 *   npm run gen-reset-token -- --username admin
 *   npm run gen-reset-token -- --username provider1
 *
 * Then open /reset, choose "Provider / Admin", enter the username and code.
 */

import { PrismaClient } from '@prisma/client'
import { randomBytes, createHash } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const usernameFlag = args.indexOf('--username')
  if (usernameFlag === -1 || !args[usernameFlag + 1]) {
    console.error('Usage: npm run gen-reset-token -- --username <username>')
    process.exit(1)
  }
  const username = args[usernameFlag + 1]

  const provider = await prisma.provider.findUnique({ where: { username } })
  if (!provider) {
    console.error(`No provider found with username: ${username}`)
    process.exit(1)
  }

  const raw   = randomBytes(4).toString('hex').toUpperCase()
  const code  = `${raw.slice(0, 4)}-${raw.slice(4)}`
  const hash  = createHash('sha256').update(raw).digest('hex')
  const expiry = new Date(Date.now() + 4 * 60 * 60 * 1000)

  await prisma.provider.update({
    where: { id: provider.id },
    data: { resetToken: hash, resetTokenExpiry: expiry },
  })

  console.log()
  console.log(`Reset token for "${provider.name}" (${username}):`)
  console.log()
  console.log(`  Code   : ${code}`)
  console.log(`  Expires: ${expiry.toLocaleString()}`)
  console.log()
  console.log('Open /reset → select Provider/Admin → enter username + code → set new password.')
  console.log()
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
