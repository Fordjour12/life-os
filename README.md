# life-os

Recovery-first Life OS built as a Bun + Turborepo monorepo with:

- `apps/native`: Expo React Native client (Expo Router + Uniwind + HeroUI Native)
- `packages/backend`: Convex backend (auth, commands, queries, policies, AI actions)
- shared packages for environment parsing and domain/kernel logic

## Product Principles

- Shame is a bug.
- AI proposes; humans decide.
- Events are source of truth; state is derived.
- Suggestions stay sparse (1-3 visible at once).
- Rest is a valid state.

## Architecture

The app follows an event-driven command loop:

1. UI sends a command with an `idempotencyKey`.
2. Backend validates input + auth.
3. Backend deduplicates and appends event(s).
4. Reducers derive current state from events.
5. Policies generate bounded suggestions.
6. UI consumes reactive queries from Convex.

This keeps writes explicit, auditable, and safe:

- no direct AI mutation of state
- command validation before persistence
- idempotent sync-friendly writes

## Kernel Architecture

The kernel is the behavioral core of Life OS: commands, events, reducer logic, and policy suggestions.

### Packages

- `packages/domain-kernel`: canonical shared domain primitives (types, reducer, policies, trace/test harness).
- `packages/kernel`: existing local kernel package used by parts of the native app.
- `packages/backend/convex/kernel`: server orchestration layer that validates commands, writes events, derives state, and runs policies.

### Current Execution Model

1. A command is proposed from UI.
2. Convex kernel validates and executes it with idempotency protection.
3. Domain state is reduced from events.
4. Policies produce limited suggestions (proposals, not forced actions).

### Important Current Caveat

Today, two kernel tracks coexist:

- shared/domain behavior in `packages/domain-kernel`
- legacy/local behavior in `packages/kernel`

This is intentional short-term, but the long-term direction is a single shared kernel used consistently by both native and backend runtimes.

### Runtime Components

- Native app shell: `apps/native/app/_layout.tsx`
- Auth client/context: `apps/native/lib/auth-client.ts`, `apps/native/contexts/auth-context.tsx`
- Command entrypoint: `packages/backend/convex/kernel/commands.ts`
- Reducers/policies: `packages/backend/convex/kernel/reducer.ts`, `packages/backend/convex/kernel/policies.ts`
- Data model: `packages/backend/convex/schema.ts`

### Key Backend Tables

- `events`: append-only event log
- `stateDaily`: derived daily state cache
- `suggestions`: proposal lifecycle
- `tasks`: task domain projection

Supporting domains include calendar, journal, weekly reviews, and identity guardrails.

### Local-First Direction

The product is converging on a unified local-first model:

- device handles instant/offline experience for today
- server provides shared truth, validation, and dedupe
- command outbox + idempotency keys drive resilient sync

See `docs/application-architecture.md` for the canonical architecture write-up.

## Monorepo Layout

```txt
life-os/
├── apps/
│   └── native/                  # Expo React Native app
├── packages/
│   ├── backend/                 # Convex backend
│   ├── domain-kernel/           # Shared domain reducer/policy logic
│   ├── kernel/                  # Existing local kernel package
│   ├── env/                     # Shared env parsing helpers
│   └── config/                  # Shared TS config
├── docs/
│   └── application-architecture.md
└── AGENTS.md
```

## Getting Started

### Prerequisites

- Bun `>=1.3`
- Node.js (needed by Expo/React Native toolchain)
- Expo tooling for native device/simulator workflows
- Convex account/project

### Install

```bash
bun install
```

### Configure Convex

```bash
bun run dev:setup
```

This runs Convex configure flow (`convex dev --configure --until-success`) in `packages/backend`.

If needed, copy environment values from `packages/backend/.env.local` into native app env files (client-safe values only, `EXPO_PUBLIC_*` on client).

### Run Development

```bash
bun run dev
```

Useful focused commands:

- `bun run dev:native` - run Expo app only
- `bun run dev:server` - run Convex backend only
- `bun run -C apps/native ios` - run iOS native build
- `bun run -C apps/native android` - run Android native build

## Scripts

- `bun run dev` - turbo dev for all workspaces
- `bun run build` - turbo build
- `bun run check-types` - turbo typecheck
- `bun run check` - oxlint + oxfmt
- `bun run dev:native` - native app dev server
- `bun run dev:server` - backend dev server
- `bun run dev:setup` - Convex setup/bootstrap

## Codebase Conventions

- TypeScript strict mode across workspaces.
- Expo Router for navigation in `apps/native/app`.
- Uniwind class-based styling and HeroUI Native components.
- Convex functions in `packages/backend/convex`.
- Do not edit generated Convex files in `packages/backend/convex/_generated`.

## Testing Status

There is currently no dedicated test runner configured in root scripts.

Use:

- `bun run check-types`
- `bun run check`

as baseline quality gates until test scripts are added.
