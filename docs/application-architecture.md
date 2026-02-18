# Life OS Application Architecture (Single Source of Truth)

This is the only canonical documentation file for the application architecture.

## 1) Product intent

Life OS is a recovery-first system:

1. Shame is a bug.
2. AI proposes; humans decide.
3. Events are truth; state is derived.
4. Rest is valid.
5. Suggestions stay sparse (1-3 visible).

## 2) Monorepo shape

- `apps/native`: Expo React Native app (UI, routing, providers).
- `packages/backend/convex`: backend (auth, commands, queries, policies, AI actions).
- `src/kernel/types.ts`: canonical shared domain types (commands, events, life state, suggestions).
- `packages/kernel`: local kernel primitives still present.

## 3) Current runtime architecture (implemented now)

### App boot and providers

Entry: `apps/native/app/_layout.tsx`

Provider stack:

1. `BootGate`
2. `ConvexBetterAuthProvider`
3. `AuthProvider`
4. app theme + UI providers
5. `KernelProvider`
6. Expo Router stack

### Auth

- Native client: `apps/native/lib/auth-client.ts`
- Auth context: `apps/native/contexts/auth-context.tsx`
- Backend auth: `packages/backend/convex/auth.ts`
- Auth config: `packages/backend/convex/auth.config.ts`
- Convex app wiring: `packages/backend/convex/convex.config.ts`

### Core behavior loop

Primary command entry:

- `packages/backend/convex/kernel/commands.ts` (`executeCommand`)

Flow:

1. UI sends command + `idempotencyKey`.
2. Backend validates/auth checks.
3. Backend dedupes by `(userId, idempotencyKey)` in `events`.
4. Backend writes event(s) and applies domain updates (for example task status).
5. Backend recomputes state via `packages/backend/convex/kernel/reducer.ts`.
6. Backend stores `stateDaily`.
7. Backend runs policies via `packages/backend/convex/kernel/policies.ts`.
8. Backend writes new suggestions (bounded by caps/cooldowns).
9. UI updates reactively from Convex queries.

### Key data tables

Defined in `packages/backend/convex/schema.ts`:

1. `events` (append-only event log with idempotency key)
2. `stateDaily` (derived daily snapshot)
3. `suggestions` (proposal lifecycle)
4. `tasks` (active/paused/completed)
5. supporting tables: calendar, journal, weekly reviews, prefs

### Main screen integration

Primary screen: `apps/native/app/(tabs)/index.tsx`

- Reads `api.kernel.commands.getToday`, tasks, identity insights.
- Writes via task mutations and `api.kernel.commands.executeCommand`.
- Calls AI actions via `api.kernel.vexAgents.*`.

## 4) Stabilization and safety defaults

Current defaults are centralized in:

- `packages/backend/convex/kernel/stabilization.ts`

Operating expectations:

1. Suggestion cap is low.
2. Cooldowns prevent repeat spam.
3. Rest/late-night/focus windows suppress aggressive nudges.
4. Suggestions influence user choice; they never force actions.

## 5) Known architectural caveat

The repo currently has two behavioral tracks:

1. Convex kernel path (`packages/backend/convex/kernel/*`) used by primary app flows.
2. Local kernel path (`packages/kernel`, `apps/native/lib/kernel-provider.tsx`).

This is workable short-term, but it risks drift if both evolve independently.

## 6) Target architecture direction

Move to a unified local-first model with one canonical domain kernel:

1. Local runtime handles instant/offline UX.
2. Server handles shared truth, validation, sync, and heavier insights.
3. Same reducer/policy logic runs in both environments.

### Desired local tables

1. `local_events`
2. `local_state_daily`
3. `local_suggestions`
4. `outbox_commands`
5. `sync_cursor`

### Desired sync contract

1. `pushCommands(batch)` with idempotency keys.
2. `pullEventsSince(cursor)` for canonical server events.

## 7) Migration summary

High-level phases:

1. Add guardrails/telemetry/tests baseline.
2. Create one shared `domain-kernel` package.
3. Refactor backend to orchestrate shared domain logic.
4. Add native outbox + local read models in shadow mode.
5. Roll out sync v2 and cut over progressively.
6. Remove duplicate kernel path.

## 8) Change policy for this document

When architecture/behavior changes:

1. Update this file in the same PR.
2. Keep statements factual and file-referenced.
3. Keep conceptual ideas only if tied to implementation or accepted target direction.
