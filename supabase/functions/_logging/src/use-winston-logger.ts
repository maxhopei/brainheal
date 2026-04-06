import { createLogger, format as winstonFormat, type Logger as WinstonLogger, transports } from 'winston'
import { recursiveError } from './recursive-error.ts'
import type { LogFormat, LogLevel } from './logger.ts'

type WinstonLogLevel = string

const levelMap: Record<LogLevel, WinstonLogLevel> = {
  debug: 'debug',
  info: 'info',
  warning: 'warn',
  error: 'error',
}

const loggersRegistry = new Map<string, WeakRef<WinstonLogger>>()

export const useWinstonLogger = (
  level: LogLevel,
  format: LogFormat,
): WinstonLogger => {
  const key = `${level}-${format}`
  const cached = loggersRegistry.get(key)?.deref()
  if (cached) return cached

  const { combine, timestamp, json } = winstonFormat

  const formats = []
  formats.push(timestamp())
  formats.push(recursiveError({ maximumDepth: 10 }))

  formats.push(
    json({
      deterministic: false,
      space: format === 'pretty' ? 2 : undefined, // Always JSON, just formatted if "pretty"
    }),
  )

  const logger = createLogger({
    level: levelMap[level],
    format: combine(...formats),
    transports: [new transports.Console()],
  })

  loggersRegistry.set(key, new WeakRef(logger))
  return logger
}
