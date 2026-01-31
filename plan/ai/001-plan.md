# AI Kernel Plan (MVP)

## Context
- Kernel loop already exists: events -> state -> policies -> suggestions -> commands.
- Missing piece: AI suggestion layer that proposes actions without direct mutation.

## Goal
- Add an AI policy stage that emits `KernelSuggestion` entries and routes acceptance through existing command handlers.
- Preserve two-phase commit: propose -> human approve -> command -> event.

## Implementation Plan
1. Anchor on existing kernel flow
   - Backend loop: `packages/backend/convex/kernel/commands.ts`, `packages/backend/convex/kernel/planReset.ts`.
   - Suggestions: stored in `suggestions`, surfaced in `apps/native/app/(tabs)/index.tsx` and `apps/native/app/(tabs)/inbox.tsx`.
   - Commands already emit events and recompute state.
2. Add AI policy module
   - New module returns `KernelSuggestion[]`, same shape as `runPolicies`.
   - Inputs: `LifeState`, recent events, plan, tasks, calendar blocks, capacity metrics.
   - Output limited to known suggestion types (including `NEXT_STEP`).
   - Run `sanitizeSuggestionCopy` on AI text.
3. Decide where AI runs
   - Convex `action` calls provider and returns suggestions.
   - Insert suggestions via the same cap/cooldown logic used by `executeCommand`.
4. Map AI suggestions to commands (two-phase)
   - Accept is always human-triggered in UI.
   - Use existing commands/mutations (`applyPlanReset`, `executeCommand`, `resumeTask`).
   - Add new `KernelCommand` variants only when a suggestion needs new behavior.
5. UI wiring
   - Extend suggestion UI to render new types and route acceptance to correct command.
   - Keep `submit_feedback` for downvote/ignore.
6. Minimal first AI feature (fast path)
   - `NEXT_STEP`: pick a task/time slice from state + plan + focus capacity.
   - Use rule-based selection first; optional LLM for copy only.

## Safety and Guardrails
- AI only produces suggestions, never writes data.
- Every suggestion must include a clear reason string.
- Guardrails apply: no shame language, no diagnostics.

## Acceptance Criteria
- New AI suggestions appear in `suggestions` with capped volume.
- Accepting suggestions always routes through command validation.
- State remains fully derived from events.

## Decision Needed
- Runtime: Convex Agents (Convex Actions) for AI execution.
- Provider: OpenRouter SDK for model routing.
- Policy mode: rule-based logic + LLM for copy only (default).
