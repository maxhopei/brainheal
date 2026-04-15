import type { Logger as WinstonLogger } from 'winston'
import { useWinstonLogger } from './use-winston-logger.ts'

enum LogLevelEnum {
  debug = 'debug',
  info = 'info',
  warning = 'warning',
  error = 'error',
}

enum LogFormatEnum {
  json = 'json',
  pretty = 'pretty', // Still JSON, but pretty
}

type Props = Record<string, unknown>

const DEFAULT_LOG_LEVEL = 'info'
const DEFAULT_LOG_FORMAT = 'json'

export type LogLevel = `${LogLevelEnum}`
export type LogFormat = `${LogFormatEnum}`
export type LoggerOptions = {
  level?: LogLevel
  format?: LogFormat
}

export class Logger {
  private constructor(
    private readonly logger: WinstonLogger,
    private readonly context: Props,
  ) {}

  /**
   * Create an instance of the logger.
   * @param {string | undefined}        scope   Could be a module, a class, a function or anything else.
   * @param {LoggerOptions | undefined} options Log `level` and `format`. Will be detected automatically
   *                                            from the env variables if not provided
   */
  public static create(scope?: string, options?: LoggerOptions): Logger {
    const winstonLogger = useWinstonLogger(
      options?.level ?? detectLogLevel(),
      options?.format ?? detectLogFormat(),
    )

    return new Logger(winstonLogger, { scope })
  }

  public addProps(props: Props): void {
    Object.assign(this.context, props)
  }

  public addProp(prop: string, value: unknown): void {
    this.context[prop] = value
  }

  public withProps(props: Props): Logger {
    return new Logger(this.logger, { ...this.context, ...props })
  }

  public withProp(prop: string, value: unknown): Logger {
    return this.withProps({ [prop]: value })
  }

  public withScope(scope: string): Logger {
    return this.withProps({ scope })
  }

  public withException(error: Error | unknown): Logger {
    return this.withProps({ error })
  }

  /**
   * @internal Used mainly for tests. There should be no need to use it in your code.
   */
  public get props(): Props {
    return this.context
  }

  debug(message: string) {
    this.logger.debug(message, this.context)
  }

  info(message: string) {
    this.logger.info(message, this.context)
  }

  warning(message: string) {
    this.logger.warn(message, this.context)
  }

  error(message: string) {
    this.logger.error(message, this.context)
  }
}

/**
 * @internal Only for testing purposes
 */
export const detectLogLevel = (): LogLevel => {
  let level = Deno?.env.get('LOG_LEVEL')
  if (level === undefined || level === '') return DEFAULT_LOG_LEVEL

  // Tolerating "warn"
  if (level === 'warn') level = 'warning'

  if (!(level in LogLevelEnum)) {
    throw new Error(
      `Invalid log level set. Expected one of [${Object.keys(LogLevelEnum).join(', ')}], given "${level}".`,
    )
  }

  return level as LogLevel
}

/**
 * @internal Only for testing purposes
 */
export const detectLogFormat = (): LogFormat => {
  const format = Deno?.env.get('LOG_FORMAT')
  if (format === undefined || format === '') return DEFAULT_LOG_FORMAT

  if (!(format in LogFormatEnum)) {
    throw new Error(
      `Invalid log format set. Expected one of [${Object.keys(LogFormatEnum).join(', ')}], given "${format}".`,
    )
  }

  return format as LogFormat
}
