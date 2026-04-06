# Logging Library

This library provides a way to improve and unify logging across multiple services in a project.
It is basically a convenient wrapper around [winston](https://github.com/winstonjs/winston).
Using this makes sure to have a consistent logging structure throughout the whole project.

- [Configuration](#configuration)
- [Usage](#usage)
- [Best practices](#best-practices)

## Configuration

The library detects the configuration from the environment variables in order to minimise the bootstrap code.

- `LOG_LEVEL`:
  Optional.
  Allowed values: `debug`, `info`, `warning` (`warn` is also accepted), `error`.
  Default value: `info`.
- `LOG_FORMAT`:
  Optional.
  Allowed values: `json`, `pretty`.
  Default value: `json`.

In case of using the environment variables there's no need for any explicit configuration.

With or without environment variables, one can create a logger instance with custom level and format:

```typescript
const logger = Logger.create('<scope>', { level: 'debug', format: 'pretty' })
```

This might be useful in order to debug only a particular part of the application.
See [Usage](#usage) section for more details on how to create an instance.

## Usage

### Scopes

The library supports scoping the logger instances which is the recommended way of using it.
A scope can be a module, a class, a function, or any logical unit that you define:

```typescript
import { Logger } from '@brainheal/logging'

class MyClass {
  private readonly logger: Logger

  constructor() {
    this.logger = Logger.create(this.constructor.name)
  }
}

function doSomething() {
  const logger = Logger.create('doSomething')
  // ...
}

const logger = Logger.create('my-module')
```

A scope is added as property to the log record:

```
{"level":"info","message":"Something happend","scope":"MyClass","timestamp":"2024-07-08T09:01:42.320Z"}
```

Scope is optional and can be omitted if not needed. No property will be added to the log record in this case.

The library also ingestions a global logger instance with the scope set to `"global"` for simple integrations. However,
this is not a recommended approach for more complex services.

```typescript
import { globalLogger } from '@brainheal/logging'

globalLogger.info('My message')
```

### Logging

#### Levels

The logger provides 4 methods to log messages of corresponding levels:

```typescript
const logger = Logger.create('<scope>')

logger.debug('Detailed step of a particular operation, needed for debugging in case of issues.')
logger.info('Useful information about the lifecycle of an application.')
logger.warning('An important but recoverable issue. Something worth observing, but not neccesary critical.')
logger.error('A non recoverable issue. Usually leads to interruption of the operation or the whole process.')
```

#### Props (Context)

A good practice is to enrich the log records with the context in which the situation happens.
This can be done with `withProp` or `withProps` methods:

<!-- prettier-ignore-start -->

```typescript
const logger = Logger.create('ingestion')

logger
  .withProp('tenant', tenantId)
  .withProps({
    ingestionId,
    postId,
  })
  .info('Starting ingestion process')
// {"scope":"ingestion","tenant":"test-tenant","ingestionId":"123","postId":"sales-order","level":"info","message":"Starting ingestion process","timestamp":"2024-07-08T09:34:48.167Z"}
```

<!-- prettier-ignore-end -->

Both `withProp()` and `withProps()` create a new instance of the logger with added properties, which can be conveniently
used to "set up" a logger for a particular context and re-use it multiple times without repetitions:

<!-- prettier-ignore-start -->

```typescript
const logger = Logger.create('ingestion')

const ingestionLogger = logger
  .withProp('tenant', tenant)
  .withProps({
    ingestionId,
    postId,
  })

try {
  ingestionLogger.info('Starting ingestion process')
  // do ingestion
  ingestionLogger.info('Ingestion finished successfully')
} catch {
  // See Error Handling for a better error handling example
  ingestionLogger.error('Ingestion failed')
}
```

<!-- prettier-ignore-end -->

All log records will contain the same context, which can be used in the logs explorer to filter them.

A [scope](#scopes) is nothing more than just another property on the logger context, so it can be overwritten
via `withProp()`/`withProps()` or via a dedicated method: `withScope()`. This can be used to create a sub-scoped logger,
for example, changing the scope, but keeping the rest of the context.

#### Error Handling

When an error happens it is important to give a sufficient context for anyone who will be looking into logs to
understand exactly what and where happened, what was the cause of it, and what are the consequences of it.

Using the log [context](#props-context) is a good way of doing it, and the library provides a special method for
adding the error information to the context: `withException()`:

<!-- prettier-ignore-start -->

```typescript
const logger = Logger.create('ingestion')

try {
  // do ingestion
} catch (error) {
  logger
    .withException(error)
    .error('Ingestion failed')
}
```

<!-- prettier-ignore-end -->

The `withException` method is tolerant towards the data type and accepts anything, same as the `catch` does. In case the
error is an instance of the `Error` class the following properties will be extracted from it:

- `name`
- `message`
- `stack`
- `cause`

The `cause` property is extracted recursively (up to depth of 10), meaning that if the cause itself is an instance of
an `Error` all its properties will be extracted and logged correspondingly. This provides support for well-structured
error handling in the application.

Note:

- the method name is intentionally not `withError` in order to not mix it up or relate with the `error()` method
  and/or "error" log level. Those two are independent and don't have to go with each other.

## Best practices

### Use structured context over templating it into the log message

<!-- prettier-ignore-start -->

```typescript
// Preferred way:
logger
  .withProps({ tenant, ingestionId })
  .info('Starting ingestion process')

// Better avoid:
logger.info(`Starting ingestion ${ingestionId}, for tenant ${tenant}`)
```

<!-- prettier-ignore-end -->

Baking context into the free text complicates filtering the logs, clutters the code and the log message itself, and
leads to code duplication when logging multiple messages in the same context.

### Provide a meaningful error log message instead of `error.message`

<!-- prettier-ignore-start -->

```typescript
// Preferred way:
logger
  .withException(error)
  .error('Ingestion failed')

// Better avoid:
logger.error(error)
logger.error(error.message)
```

<!-- prettier-ignore-end -->

Just throwing the error into the debugger's face is not very informative. An error can be a `fetch`'s internal, which
will let you know that the network request failed, but will not tell you what was the network request about. All
the `error`'s props will be extracted automatically by the logger, so there's no need to repeat them.

### Not every caught error is an error in your logs

It is absolutely normal to do log warnings, infos or debug messages with exceptions, all based on a particular
situation:

<!-- prettier-ignore-start -->

```typescript
logger
  .withException(error)
  .warning('Network request failed, retrying')
```

```typescript
logger
  .withException(validationError)
  .info('Invalid user input provided')
```

<!-- prettier-ignore-end -->

## Contributing

### Suggest changes

1. Create a branch
2. Make changes, commit and push
3. Create a Pull Request describing your changes. Assign to a relevant team member.

### Publish a new version

Once your changes are approved and merged you can publish the new version of the library by creating a corresponding git
tag. The tag must be named as `v<semver>`. Example: `v1.0.0`, `v1.0.1-beta.1`. Creation of such a tag will trigger a
publishing pipeline.
