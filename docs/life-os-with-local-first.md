# Local-first + React Native + Convex

The idea is:

- **Local-first = your app works fully offline** (fast, instant)
- **Convex = your sync + realtime + server policies + multi-device** (when online)

You design it so the **kernel runs on-device**, and Convex becomes the **cloud mirror + batch brain**.

---

## Big picture: Local-first with Convex (the right mental model)

### Source of truth

- **On-device is the primary truth for “today” experience**
- **Convex is the shared truth across devices + long-term analytics**

### Core loop

1. User action → write **locally** (instant)
2. Add a **command** to an outbox
3. When online → flush outbox to Convex
4. Convex validates + stores events + computes server insights
5. Client pulls/merges server updates

---

## What you need in a Local-first design

### 1) Local database (not just MMKV)

MMKV is great for caching and settings, but for local-first Life OS you want queries.

Best options:

- **SQLite** (most common)
- **WatermelonDB** (built for offline sync)
- **Realm** (powerful but heavier)

**Recommendation:** SQLite (simple, predictable) + MMKV for small cached state.

---

## Local-first kernel architecture (clean + buildable)

### On-device tables

- `local_events` (append-only)
- `local_state_daily` (snapshots)
- `local_suggestions` (inbox)
- `outbox_commands` (to sync)
- `sync_cursor` (last server checkpoint)

### Server tables (Convex)

- `events`
- `stateDaily` (optional snapshot)
- `suggestions`
- `insights`

---

## Two-way sync strategy (practical & safe)

### A) Client → Server (upload)

You upload **commands** (not raw events) so the server stays secure.

**Outbox item**

```json
{
  "id": "cmd_001",
  "cmd": "complete_task",
  "input": { "taskId": "tsk_123" },
  "idempotencyKey": "deviceA:1700:cmd_001",
  "createdAt": 1700000000
}
```

Server response:

- accepted / rejected
- server event IDs produced
- new server cursor

### B) Server → Client (download)

Client pulls events since cursor:

- `getEventsSince(cursor)`
- applies them locally (idempotent)

### Merge rule

- Server events are authoritative for anything that involves shared state.
- Local events are authoritative for immediate UX until server confirms.

---

## The most important thing to understand: Idempotency

Mobile networks retry. Sync can double-send.

So every command needs an `idempotencyKey`.

- Convex stores it
- If seen before → ignore duplicates

This prevents “double complete task”, “double add expense”, etc.

---

## Where do policies run in local-first?

### Option 1 (best UX): Policies run on-device

- instant suggestions
- works offline
- feels magical

When you sync, server can also run policies and send back “server suggestions”.
You then merge them with local suggestions.

### Option 2 (simpler): Policies run only on server

- offline works, but no smart suggestions offline
- not ideal for your “Life OS” brand

**Recommendation:** run **light policies locally**, run **heavy insights weekly** on server.

---

## Event → Insight pipeline in local-first

### Local (fast)

- overload detection
- momentum
- daily reflection prompt

### Server (deep)

- weekly patterns
- correlations (late-night spending, planning accuracy)
- long-term habit drift

---

## AI in local-first (safe + useful)

AI should **never** mutate local DB directly.

Flow:

1. Local state + recent insights → sent to AI
2. AI returns **proposals** (suggested commands)
3. User taps Apply → commands added to outbox
4. Outbox syncs to Convex

So AI remains a “planner”, not a “hacker”.

---

## Step-by-step build plan (local-first + Convex)

### Phase 1 — Local kernel MVP

1. Implement local SQLite schema:
   - events, stateDaily, suggestions, outbox

2. Implement `appendLocalEvent()`
3. Implement `computeDailyState(day)`
4. Implement 3 local policies:
   - Overload Guard
   - Momentum Builder
   - Daily Review

5. Build RN screens:
   - Today (state)
   - Inbox (suggestions)
   - Tasks + Planner hooks emit events

**Result:** full offline Life OS experience.

---

### Phase 2 — Sync with Convex

6. Convex mutations:
   - `executeCommand(command, idempotencyKey)`

7. Convex query:
   - `getEventsSince(cursor)`

8. Client sync worker:
   - flush outbox
   - pull server events
   - update cursor

**Result:** multi-device consistency + cloud backup.

---

### Phase 3 — Server insights + weekly review

9. Convex scheduled jobs:
   - nightly summary
   - weekly review generation

10. Sync those insights to client

**Result:** “coach intelligence” gets deeper over time.

---

## What makes this a “solid stack”

- React Native gives you the product surface
- Local-first kernel gives you speed + offline + stickiness
- Convex gives you realtime sync, compute, jobs, and storage
- AI fits safely as “proposal-only”

---

## Biggest design decisions (and my recommendation)

1. **Local DB**: SQLite
2. **Sync unit**: commands with idempotency keys
3. **Truth model**: events as truth, snapshots for speed
4. **Policies**: lightweight local, deep server
5. **AI**: proposals only + user approval

---

## File structure and schemas help form an AI

If you want, I can give you the **exact file structure + schemas** for:

- SQLite tables (RN)
- Convex schema + mutations + queries
- Sync worker (outbox flush + pull since cursor)

Just tell me: do you want SQLite with **expo-sqlite**, or something like **WatermelonDB**?
