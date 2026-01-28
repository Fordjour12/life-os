# Better-T-Stack Project Rules

This is a life-os project created with Better-T-Stack CLI.

## Project Structure

This is a monorepo with the following structure:

- **`packages/backend/`** - Convex backend functions

- **`apps/native/`** - React Native mobile app (with NativeWind)

## Available Scripts

- `bun run dev` - Start all apps in development mode
- `bun run dev:native` - Start only the native app
- `bun run build` - Build all apps
- `bun run lint` - Lint all packages
- `bun run typecheck` - Type check all packages

## Authentication

Authentication is powered by Better Auth:

- Auth configuration is in `packages/auth/src/`
- Native app auth client is in `apps/native/src/lib/auth-client.ts`

## Project Configuration

This project includes a `bts.jsonc` configuration file that stores your Better-T-Stack settings:

- Contains your selected stack configuration (database, ORM, backend, frontend, etc.)
- Used by the CLI to understand your project structure
- Safe to delete if not needed

## Key Points

- This is a Turborepo monorepo using bun workspaces
- Each app has its own `package.json` and dependencies
- Run commands from the root to execute across all workspaces
- Run workspace-specific commands with `bun run command-name`
- Turborepo handles build caching and parallel execution
