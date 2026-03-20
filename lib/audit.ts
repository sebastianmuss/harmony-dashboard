import { prisma } from '@/lib/db'

export interface AuditEntry {
  actorType: string
  actorId?: number | null
  action: 'create' | 'update' | 'delete' | 'export' | 'import'
  resource: string
  resourceId?: number | null
  changes?: Record<string, unknown>
  ip?: string | null
}

/**
 * Fire-and-forget append to AuditLog.
 * Never throws — audit failures must not interrupt user-facing operations.
 */
export function writeAudit(entry: AuditEntry): void {
  prisma.auditLog.create({
    data: {
      actorType: entry.actorType,
      actorId:   entry.actorId   ?? null,
      action:    entry.action,
      resource:  entry.resource,
      resourceId: entry.resourceId ?? null,
      changes:   entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : undefined,
      ip:        entry.ip        ?? null,
    },
  }).catch((err: unknown) => {
    process.stderr.write(`[audit] FAILED to write audit log: ${err instanceof Error ? err.message : String(err)}\n`)
  })
}

/** Extract client IP from request headers (set by Caddy via x-forwarded-for). */
export function getIp(req: Request): string | null {
  const fwd = (req.headers as Headers).get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return null
}
