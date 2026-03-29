# Contributing to BrainHeal

Thanks for your interest in contributing, hehe.

## Getting Started

- Clone the repo locally
- Install dependencies with `deno install`
- Start the services in Docker containers with `deno task docker:start`  
  (or with `deno task docker:start:ci` to use the test OIDC server and Login UI)
- Run tests with `npm task test`

## Architecture

See [Architecture documentation](specs/architecture.md) for the details.

## Application Design

All services follow a
simplified [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) with the
following nuances:

- The Entities/Domain layer practically doesn't exist (merely a few repository interfaces).
- The Use Cases do the job directly using the repositories and clients for external APIs. This way Use Cases hold the
  core business logic of every action.
- Use cases are triggered via various "invokers", such as HTTP handlers, or schedule-based reconcilers.

### Repository Structure

This repo uses [Deno Workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/).

Below is the overview on of the top-level directories:

- `auth_library` (Deno workspace) — Networks server-side auth library. Published as an NPM package. Provides a handy
  interface for interacting with the Auth services.
- `components` — building blocks of the Networks Auth
  - `access_control` (Deno workspace) — The Access Control service
  - `http_server` (Deno workspace) — A shared HTTP server used by all auth services
  - `hydra_proxy_client` (Deno workspace) — A shared client library used by the Login Bridge and Reconciler
  - `login_bridge` (Deno workspace) — The Login Bridge service
  - `otel` (Deno workspace) — Shared OpenTelemetry functions used by all auth services
  - `reconciler` (Deno workspace) — The Reconciler service
- `docker` — A set of configuration files supporting the Docker Compose setup.
- `docs` — Networks Auth documentation
- `examples` — A few examples on how to use the Networks Auth.
- `http_test` — A set of HTTP files with preconfigured requests for manual execution, helpful during development.
- `integration_tests` (Deno workspace) — Integration tests for the whole Networks Auth suite.

### Configuration

All services are configured using environment variables. You can find the comprehensive list of variables in the
`service_configuration.ts` file in the root folder of each service.

### HTTP Server

All services use Deno built-in HTTP server. A few helper functions are extracted into the `components/http_server`
library.

Routing is based on the URL pattern matching. The first matching route is executed and the response is returned.

### Invokers

Invokers are the outermost edges of every service. They connect services with the world outside, react to signals, such
as HTTP request, or time change, collect the request parameters, and invoke the corresponding Use Case.

In practice currently, there are two types of invokers:

- HTTP Route
- Time-based trigger (reconciliation)

### Use Cases

Use Cases serve as the core business logic of each service. They are abstracted out from the way they are invoked:
whether an action is triggered via HTTP request or based on the cronjob — is irrelevant for the Use Case.

Use Cases [scream](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) about the services
architecture. If you want to know what a service does — look in the `use_cases` folder.
If you want to know when and how — look into the `invokers` folder.

### Adding new functionality

Adding a new functionality typically involves creating a new Use Case file and a corresponding Invoker. The rest highly
depends on the particular situation.

Note, that there's no hard rule on 1-to-1 relationship between a use case and an invoker. Sometimes an HTTP request
might trigger multiple use cases, or a single use case might be triggered in various ways.

Make sure to check the services README.md for more details on each service.

--  
Yours, the documentation writer.
