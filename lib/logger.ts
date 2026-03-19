import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

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
  isDev
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
    : undefined  // In production: plain JSON to stdout → captured by Docker / log aggregator
)

export default logger
