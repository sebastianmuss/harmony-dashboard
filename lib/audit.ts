import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

// Sentinel value used as prevHash for the very first audit entry.
const GENESIS = '0'.repeat(64)

/**
 * Deterministic JSON serialization with alphabetically sorted keys.
 * Required because PostgreSQL's jsonb type reorders keys alphabetically,
 * so reading back a stored object produces different key order than the
 * original. Using sorted keys in the hash ensures write and verify agree.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const obj = value as Record<string, unknown>
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

export interface AuditEntry {
  actorType: string
  actorId?: number | null
  action: 'create' | 'update' | 'delete' | 'view' | 'export' | 'import' | 'failed_login' | 'reset_token'
  resource: string
  resourceId?: number | null
  changes?: Record<string, unknown>
  ip?: string | null
}

/**
 * Compute SHA-256 over the canonical fields of one audit entry.
 * Fields are joined with null bytes to prevent boundary collisions.
 * prevHash links this entry to its predecessor — breaking the link
 * reveals any deletion or reordering in the chain.
 */
function computeHash(fields: {
  timestamp: Date
  actorType: string
  actorId: number | null
  action: string
  resource: string
  resourceId: number | null
  changesJSON: string
  ip: string | null
  prevHash: string
}): string {
  const input = [
    fields.timestamp.toISOString(),
    fields.actorType,
    String(fields.actorId ?? ''),
    fields.action,
    fields.resource,
    String(fields.resourceId ?? ''),
    fields.changesJSON,
    fields.ip ?? '',
    fields.prevHash,
  ].join('\x00')
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Fire-and-forget append to AuditLog with hash chaining.
 *
 * Uses a SERIALIZABLE transaction so that the prevHash read and the
 * subsequent insert are atomic — preventing two concurrent writes from
 * producing duplicate prevHash values. On a serialization conflict the
 * write is retried up to 3 times with a short back-off.
 *
 * Never throws — audit failures must not interrupt user-facing operations.
 */
export function writeAudit(entry: AuditEntry): void {
  const doWrite = async (attempt = 0): Promise<void> => {
    try {
      await prisma.$transaction(async (tx) => {
        const last = await tx.auditLog.findFirst({
          orderBy: { id: 'desc' },
          select: { hash: true },
        })
        const prevHash = last?.hash ?? GENESIS
        const now = new Date()
        const changesJSON = entry.changes ? stableStringify(entry.changes) : ''
        const hash = computeHash({
          timestamp: now,
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId ?? null,
          changesJSON,
          ip: entry.ip ?? null,
          prevHash,
        })
        await tx.auditLog.create({
          data: {
            timestamp:  now,
            actorType:  entry.actorType,
            actorId:    entry.actorId   ?? null,
            action:     entry.action,
            resource:   entry.resource,
            resourceId: entry.resourceId ?? null,
            changes:    entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : undefined,
            ip:         entry.ip       ?? null,
            hash,
            prevHash,
          },
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (err) {
      if (attempt < 2) {
        // Brief back-off before retrying on a serialization conflict
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)))
        return doWrite(attempt + 1)
      }
      process.stderr.write(
        `[audit] FAILED to write audit log: ${err instanceof Error ? err.message : String(err)}\n`
      )
    }
  }
  doWrite().catch(() => {})
}

/**
 * Verify the integrity of the entire AuditLog chain.
 *
 * For each entry:
 *  1. Recompute the hash from stored fields and check it matches stored hash.
 *  2. Check prevHash matches the hash of the preceding row.
 *
 * Entries written before hash chaining was introduced (hash IS NULL) are
 * skipped but reset the expected chain — they are flagged as "legacy".
 *
 * Returns { valid, totalEntries, legacyEntries, tamperedIds }
 */
export async function verifyAuditChain(): Promise<{
  valid: boolean
  totalEntries: number
  legacyEntries: number
  tamperedIds: number[]
}> {
  const entries = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } })

  const tamperedIds: number[] = []
  let expectedPrevHash = GENESIS
  let legacyEntries = 0

  for (const entry of entries) {
    if (!entry.hash) {
      // Pre-chaining entry — skip verification, reset expected chain
      legacyEntries++
      expectedPrevHash = GENESIS
      continue
    }

    // Check chain linkage
    if (entry.prevHash !== expectedPrevHash) {
      tamperedIds.push(entry.id)
    }

    // Recompute and verify hash
    const changesJSON = entry.changes ? stableStringify(entry.changes) : ''
    const expected = computeHash({
      timestamp:  entry.timestamp,
      actorType:  entry.actorType,
      actorId:    entry.actorId,
      action:     entry.action,
      resource:   entry.resource,
      resourceId: entry.resourceId,
      changesJSON,
      ip:         entry.ip,
      prevHash:   entry.prevHash ?? GENESIS,
    })
    if (entry.hash !== expected && !tamperedIds.includes(entry.id)) {
      tamperedIds.push(entry.id)
    }

    expectedPrevHash = entry.hash
  }

  return {
    valid: tamperedIds.length === 0,
    totalEntries: entries.length,
    legacyEntries,
    tamperedIds,
  }
}

/** Extract client IP from request headers (set by Caddy via x-forwarded-for). */
export function getIp(req: Request): string | null {
  const fwd = (req.headers as Headers).get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return null
}
