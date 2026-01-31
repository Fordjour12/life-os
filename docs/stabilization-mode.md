# Stabilization Mode

This repo keeps core safeguards centralized and simple.

## Defaults
- Daily suggestion cap: 3
- Cooldown per suggestion type: 12 hours
- Late night window: 22:30–06:00 (UTC)
- Rest window influence: suppresses planning/return nudges
- Focus protection: suppresses tiny nudges

## Where to change
- `packages/backend/convex/kernel/stabilization.ts`

## Intent
- Keep suggestions sparse and dismissible.
- Prioritize recovery and rest over optimization.
- Boundaries influence suggestions only; they never enforce actions.
