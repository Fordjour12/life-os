# Convex Agents Implementation Plan

## Goal

- Add an AI policy layer that runs inside Convex and emits `KernelSuggestion` entries.
- Preserve two-phase commit: propose -> human approve -> command -> event.

## Scope

- New Convex agent/action to generate suggestions.
- Reuse existing kernel data: events, state, suggestions, tasks, calendar blocks.
- No direct data mutation from AI; only suggestions persisted.

## Architecture

- Execution host: Convex Actions (or Agents) in `packages/backend/convex/kernel/`.
- AI output format: `KernelSuggestion[]` (same as `runPolicies`).
- Storage: `suggestions` table with cap, cooldown, and status handling.

## Data Contracts

- Inputs:
  - `LifeState` from `stateDaily` (or computed on demand).
  - Recent `events` for last N days (default 7).
  - Active and paused tasks.
  - Calendar blocks for target day.
  - Plan from `PLAN_SET` events.
- Outputs:
  - `KernelSuggestion` items with `type`, `priority`, `reason`, `payload`, `status`, `cooldownKey`.

## Trigger Points

- On command execution: after `executeCommand` recomputes state.
- On plan reset: after `applyPlanReset` recomputes state.
- Optional: scheduled daily run for stale days.

## Implementation Steps

1. Create a new agent/action module
   - `packages/backend/convex/kernel/aiSuggest.ts` (action entrypoint).
   - Accept inputs: `day`, `tzOffsetMinutes`, and optional `source`.
2. Build a data assembler
   - Read `events`, `stateDaily`, `tasks`, `calendarBlocks`, `suggestions` for the day.
   - Normalize into a single context object.
3. Define AI policy output contract
   - Validate AI output against `KernelSuggestion` shape.
   - Default status = `new`.
   - Enforce suggestion cap and cooldown rules (use same logic as `executeCommand`).
4. Plug into kernel loop
   - After `executeCommand` and `applyPlanReset`, call AI action.
   - Ensure the AI action is non-blocking if possible; failures should not fail command.
5. Add safety guardrails
   - Sanitize suggestion copy using `sanitizeSuggestionCopy`.
   - Enforce max suggestions per day (`DAILY_SUGGESTION_CAP`).
6. UI rendering
   - Extend existing suggestion rendering in `apps/native/app/(tabs)/index.tsx`.
   - Map new suggestion types to existing commands.
7. Observability
   - Add structured logs for AI input size, output count, and errors.

## Guardrails

- AI never writes to `events` or `tasks`.
- All user actions go through command validation.
- Copy must pass `guardrails.ts` checks.

## Rollout

- Start with feature flag in Convex env (e.g. `AI_SUGGESTIONS_ENABLED`).
- Enable for a single test user first.
- Gradually expand once telemetry is stable.

## Acceptance Criteria

- AI suggestions appear in the inbox and today view.
- Accepting a suggestion always creates events via commands.
- No suggestion exceeds daily caps or cooldowns.
