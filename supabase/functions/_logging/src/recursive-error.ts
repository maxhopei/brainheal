import { format } from 'winston'

// deno-lint-ignore no-explicit-any
type Info = Record<string | symbol, any>

export type RecursiveErrorOptions = {
  maximumDepth: number
}

const formatError = (error: Info): Info => {
  if (!(error instanceof Error)) return error
  return Object.assign({}, error, {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause,
  })
}

export const formatRecursively = (error: Info, { maximumDepth }: RecursiveErrorOptions, depth = 0): Info => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    error.cause instanceof Error &&
    depth < maximumDepth
  ) {
    return {
      ...formatError(error),
      cause: formatRecursively(error.cause, { maximumDepth }, depth + 1),
    }
  }

  return formatError(error)
}

export const recursiveError: ReturnType<typeof format> = format((einfo, options: unknown) => {
  if (!einfo.error) return einfo

  let maximumDepth = 10 // default value

  if (
    typeof options === 'object' &&
    options !== null &&
    'maximumDepth' in options &&
    typeof options.maximumDepth === 'number'
  ) {
    maximumDepth = options.maximumDepth
  }

  return {
    ...einfo,
    error: formatRecursively(einfo.error, { maximumDepth }),
  }
})
