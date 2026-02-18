# 009: Kernel Unification + Local-First Migration Plan

## Goal

Migrate the current hybrid architecture to a unified behavioral engine with a local-first runtime model, while preserving reliability, idempotency, and existing user data.

## Scope

- Unify domain behavior (commands, events, reducer, policies) into one canonical package.
- Refactor backend handlers to orchestrate instead of embedding domain logic.
- Introduce local event log + outbox + read models in native app.
- Add sync protocol for command upload and event pull.
- Roll out with feature flags and shadow comparison.

## Assumptions

1. Zero downtime and no data loss are required.
2. Existing Convex tables remain valid during migration.
3. Migration is incremental and flag-driven.

## Phase 0: Baseline Guardrails (3-5 days)

1. Freeze canonical domain contracts from `src/kernel/types.ts`.
2. Add observability fields across command flow (`commandId`, `idempotencyKey`, `traceId`).
3. Add baseline test harness for reducer/policies/command idempotency.
4. Add migration feature flags:
- `kernel_unified_domain`
- `local_outbox_enabled`
- `local_read_model_enabled`
- `sync_v2_enabled`

### Exit Criteria

1. Baseline tests pass in current flow.
2. Telemetry captures end-to-end command execution traces.

## Phase 1: Create Canonical Domain Kernel Package (1-2 weeks)

1. Create `packages/domain-kernel` with pure modules only:
- `types`
- `commands`
- `events`
- `reducer`
- `policies`
- `suggestion-lifecycle`
2. Move behavior from backend kernel reducer/policies into shared pure functions.
3. Keep storage/network concerns in adapters only.
4. Keep existing `packages/kernel` temporarily but stop adding logic to it.

### Exit Criteria

1. Same event fixtures produce same `LifeState` and suggestions.
2. `packages/domain-kernel` has no Convex/React/runtime-specific imports.

## Phase 2: Refactor Backend to Orchestrate Domain Kernel (1-2 weeks)

1. Split `packages/backend/convex/kernel/commands.ts` into pipeline steps:
- validate
- authorize
- dedupe
- execute
- project state
- generate suggestions
2. Replace inline reducer/policy logic with `packages/domain-kernel`.
3. Replace broad payload validation (`v.any()`) for kernel commands with typed command validators.
4. Preserve current API response shape consumed by native app.

### Exit Criteria

1. Current client behavior remains stable.
2. Idempotency behavior is unchanged.
3. `getToday` output remains backward-compatible.

## Phase 3: Local-First Foundation in Native App (1-2 weeks)

1. Add SQLite layer in `apps/native` with tables:
- `local_events`
- `local_state_daily`
- `local_suggestions`
- `outbox_commands`
- `sync_cursor`
2. Build local adapters that execute the shared `packages/domain-kernel`.
3. Write user actions to local outbox.
4. Start in shadow mode:
- server remains source for UI
- local engine runs in parallel for diffing

### Exit Criteria

1. Local read model closely matches server read model in shadow metrics.
2. No UX regressions in online mode.

## Phase 4: Sync V2 Protocol (1 week)

1. Add backend sync endpoints:
- `pushCommands(batch)`
- `pullEventsSince(cursor)`
2. Enforce idempotency and replay-safe handlers.
3. Define merge semantics:
- immediate UX from local apply
- server authoritative for shared history
4. Add retry/backoff and dead-letter path for failed sync commands.

### Exit Criteria

1. Offline-created actions converge after reconnect.
2. Duplicate network retries do not duplicate side effects.

## Phase 5: Gradual Cutover (1 week)

1. Enable `local_read_model_enabled` for internal users.
2. Roll out progressively (5% -> 25% -> 50% -> 100%).
3. Keep server-driven fallback path throughout rollout.
4. Monitor mismatch rates, command failures, crash-free sessions.

### Exit Criteria

1. Mismatch and error rates stay under agreed thresholds.
2. Performance and stability remain within baseline.

## Phase 6: Decommission Duplicate Kernel Paths (3-5 days)

1. Remove duplicate or legacy kernel implementations.
2. Keep one canonical behavioral engine (`packages/domain-kernel`).
3. Remove stale feature flags and dead code.
4. Update docs and AGENTS architecture notes.

### Exit Criteria

1. Single source of truth for behavior remains.
2. Build/test scripts and docs reflect final architecture.

## Testing Strategy (Required Throughout)

1. Reducer golden tests (event replay -> state).
2. Policy decision-table tests (state/context -> suggestions).
3. Command idempotency tests (retry safety).
4. Sync convergence tests (offline then reconnect).
5. `getToday` contract tests for backward compatibility.

## Data Migration Strategy

1. Use additive schema changes first.
2. Backfill derived metadata with jobs, not hot-path mutation logic.
3. Version commands/events to support mixed client versions.
4. Remove deprecated fields only after migration window closes.

## Risks and Mitigations

1. Behavior drift during dual-run period.
- Mitigation: shadow diff checks + golden fixtures.
2. Sync duplication/conflicts under unstable networks.
- Mitigation: strict idempotency + replay-safe command handlers.
3. Oversized backend handlers slowing iteration.
- Mitigation: handler pipeline decomposition + command registry.

## Recommended Implementation Order

1. Phase 0 + Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

This order minimizes production risk while progressively unlocking true local-first behavior.
