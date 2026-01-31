# Convex + OpenRouter Implementation Plan

## Goal
- Use OpenRouter as the LLM provider inside Convex Actions.
- Keep AI execution fully server-side with no client secrets.

## Provider Setup
- Add env vars in Convex:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_BASE_URL` (optional, default https://openrouter.ai/api/v1)
  - `OPENROUTER_MODEL` (default model id)
  - `AI_SUGGESTIONS_ENABLED` (feature flag)
- Store only in Convex env; do not expose to client bundles.

## Action Interface
- New action in `packages/backend/convex/kernel/aiSuggest.ts`.
- Input: `{ day: string; tzOffsetMinutes?: number; source?: string }`.
- Output: `KernelSuggestion[]`.

## Prompt Strategy
- System prompt: enforces two-phase commit and no-shame language.
- User prompt: condensed state, key events, tasks, plan, time capacity.
- Output format: JSON array matching `KernelSuggestion` schema.

## Validation and Parsing
- Parse LLM JSON safely; reject if invalid.
- Validate each suggestion:
  - Allowed types only.
  - `reason.detail` required.
  - `payload` fields required by suggestion type.
- Apply `sanitizeSuggestionCopy` to all strings.

## Error Handling
- If OpenRouter fails: return empty suggestions and log error.
- Never block `executeCommand` or `applyPlanReset`.
- Add retry guard to avoid repeated failures in one session.

## Rate and Cost Controls
- Use a daily cap from `DAILY_SUGGESTION_CAP`.
- Add request token budget per day if needed.
- Cache the AI result for the day to avoid repeated calls.

## Integration Steps
1. Add Convex env vars and document them.
2. Implement OpenRouter client in the action.
3. Assemble context from kernel state and events.
4. Call OpenRouter, parse JSON, validate suggestions.
5. Insert suggestions using existing cooldown/cap rules.
6. Update UI handlers for any new suggestion types.

## Observability
- Log request/response sizes, model used, suggestion count.
- Store minimal metadata in a new log table only if needed.

## Acceptance Criteria
- OpenRouter calls succeed from Convex actions.
- Suggestions pass schema validation and guardrails.
- UI can accept suggestions without new client secrets.
