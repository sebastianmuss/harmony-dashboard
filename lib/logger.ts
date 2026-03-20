import pino from 'pino'

const isDev  = process.env.NODE_ENV !== 'production'
// Edge Runtime (middleware) does not support Node.js worker threads,
// which pino.transport requires. Fall back to plain JSON there.
const isEdge = typeof (globalThis as any).EdgeRuntime !== 'undefined'

const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: 'harmony-dashboard' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields wherever they appear in log objects
    redact: {
      paths: ['*.pin', '*.password', '*.passwordHash', '*.pinIndexHash', '*.token'],
      censor: '[REDACTED]',
    },
  },
  isDev && !isEdge
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
    : undefined  // In production (and Edge): plain JSON to stdout
)

export default logger
