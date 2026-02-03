# Architecture Guide: Sequence Diagrams & Call Tracking

This guide helps you understand the Life-OS codebase architecture, with sequence diagrams and patterns for tracking what calls what.

## Quick Reference

| Pattern            | Location                                                             |
| ------------------ | -------------------------------------------------------------------- |
| Auth flow          | `apps/native/lib/auth-client.ts` → `packages/backend/convex/auth.ts` |
| Command execution  | Frontend → `api.kernel.commands.executeCommand` → events → reducer   |
| State computation  | `computeDailyState()` in `kernel/reducer.ts`                         |
| Policy/suggestions | `runPolicies()` in `kernel/policies.ts`                              |
| AI actions         | `kernel/vexAgents.ts`                                                |

---

## Sequence Diagrams

### 1. Authentication Flow

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Expo App   │          │ Auth Client  │          │   Convex     │          │  Better Auth │
│   (UI)       │          │(auth-client) │          │   Backend    │          │   Server     │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │                         │
       │  1. mount()             │                         │                         │
       │────────────────────────▶│                         │                         │
       │                         │  2. getSession()        │                         │
       │                         │────────────────────────▶│                         │
       │                         │                         │  3. validateSession()   │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │  4. session ←───────────│◄────────────────────────│
       │  5. session.update()    │                         │                         │
       │◄────────────────────────│                         │                         │
       │                         │                         │                         │
       │  6. Protected routes    │                         │                         │
       │    become accessible    │                         │                         │
       └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

**Key files**:

- Frontend auth client: `apps/native/lib/auth-client.ts:1`
- Auth provider: `apps/native/contexts/auth-context.tsx:1`
- Backend auth: `packages/backend/convex/auth.ts:1`
- Auth config: `packages/backend/convex/auth.config.ts:1`

---

### 2. Command Execution Flow

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Frontend   │          │  executeCmd  │          │  Validate &  │          │   Events &   │
│   UI         │          │  Mutation    │          │   Dedup      │          │   State      │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │                         │
       │  1. useMutation()       │                         │                         │
       │    executeCommand()     │                         │                         │
       │────────────────────────▶│                         │                         │
       │                         │  2. validate(idempKey)  │                         │
       │                         │────────────────────────▶│                         │
       │                         │                         │  3. Check dedup table   │
       │                         │                         │◄────────────────────────┤
       │                         │                         │                         │
       │                         │  4. Create Event        │                         │
       │                         │────────────────────────▶│                         │
       │                         │                         │  5. Insert to `events`  │
       │                         │                         │    table                │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  6. computeDailyState() │
       │                         │                         │    (reducer.ts)         │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  7. update `stateDaily` │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  8. runPolicies()       │
       │                         │                         │    (policies.ts)        │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  9. Generate suggestions│
       │                         │                         │────────────────────────▶│
       │  10. Auto-update UI     │                         │                         │
       │◄────────────────────────│                         │                         │
       └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

**Key files**:

- Command executor: `packages/backend/convex/kernel/commands.ts:14`
- Idempotency handling: `packages/backend/convex/kernel/commands.ts:31`
- Reducer: `packages/backend/convex/kernel/reducer.ts:1`
- Policies: `packages/backend/convex/kernel/policies.ts:1`

---

### 3. Task Creation Flow

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   User UI    │          │ createTask   │          │  Commands    │          │   Database   │
│              │          │  Mutation    │          │   Handler    │          │              │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │                         │
       │  1. Enter task info    │                         │                         │
       │    (title, estimate,   │                         │                         │
       │     priority, etc)     │                         │                         │
       │────────────────────────▶│                         │                         │
       │                         │  2. Call with           │                         │
       │                         │    idempotencyKey       │                         │
       │                         │────────────────────────▶│                         │
       │                         │                         │                         │
       │                         │                         │  3. insert({
       │                         │                         │    _id: taskId,
       │                         │                         │    status: 'pending'
       │                         │                         │  }) to `tasks`
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  4. Insert event:       │
       │                         │                         │    { type: 'TASK_CREATED'│
       │                         │                         │     taskId, ... }        │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  5. recomputeState()    │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  6. runPolicies()       │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │  7. useQuery auto-      │                         │                         │
       │     updates with        │                         │                         │
       │     new state           │                         │                         │
       │◄────────────────────────│                         │                         │
       └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

**Key files**:

- Task commands: `packages/backend/convex/kernel/taskCommands.ts:1`
- Task queries: `packages/backend/convex/kernel/taskQueries.ts:1`
- Schema: `packages/backend/convex/schema.ts:1`

---

### 4. Two-Phase Commit (Suggestion → Execute)

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Suggestion │          │   Policy     │          │   Command    │          │   Reducer    │
│   Display    │          │   Engine     │          │   Executor   │          │              │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │                         │
       │  1. Show suggestion     │                         │                         │
       │     with reason         │                         │                         │
       │◄────────────────────────│                         │                         │
       │                         │                         │                         │
       │  2. User clicks         │                         │                         │
       │     "EXECUTE"           │                         │                         │
       │────────────────────────▶│                         │                         │
       │                         │  3. Call executeCommand │                         │
       │                         │    with command type    │                         │
       │                         │────────────────────────▶│                         │
       │                         │                         │                         │
       │                         │                         │  4. Validate & create   │
       │                         │                         │    event (e.g.,         │
       │                         │                         │    TASK_RESUMED)        │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  5. Reducer processes   │
       │                         │                         │    new event            │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  6. New state computed, │
       │                         │                         │    policies re-run      │
       │                         │                         │────────────────────────▶│
       │  7. UI updates with     │                         │                         │
       │     new state           │                         │                         │
       │◄────────────────────────│                         │                         │
       └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

---

### 5. AI Action Flow (Weekly Review Example)

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Frontend   │          │   useAction  │          │  vexAgents   │          │   LLM API    │
│   UI         │          │              │          │              │          │(Claude/GPT)  │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │                         │
       │  1. User clicks         │                         │                         │
       │     "Generate Draft"    │                         │                         │
       │────────────────────────▶│                         │                         │
       │                         │  2. Call action:        │                         │
       │                         │    generateWeeklyReview │                         │
       │                         │────────────────────────▶│                         │
       │                         │                         │                         │
       │                         │                         │  3. Query data:         │
       │                         │                         │    - tasks completed    │
       │                         │                         │    - journal entries    │
       │                         │                         │    - events history     │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  4. Build prompt with   │
       │                         │                         │    context              │
       │                         │                         │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  5. Call LLM API        │────────────────────────▶│
       │                         │                         │                         │
       │                         │                         │  6. Parse & save draft │                         │
       │                         │                         │    to `weeklyReviews`   │
       │                         │                         │────────────────────────▶│
       │  7. Return result       │                         │                         │
       │◄────────────────────────│                         │                         │
       └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

**Key files**:

- AI agents: `packages/backend/convex/kernel/vexAgents.ts:1`
- Weekly review: `packages/backend/convex/identity/weeklyReview.ts:1`

---

## How to Track What Calls What

### 1. Import/Dependency Patterns

**Frontend API pattern**:

```typescript
// All Convex functions are accessed via api.<module>.<function>
import { api } from "@/convex/api";
import { useQuery, useMutation, useAction } from "convex/react";

useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
useMutation(api.kernel.taskCommands.createTask);
useAction(api.kernel.vexAgents.generateWeeklyReviewDraft);
```

**Tracking query → mutation flow**:

1. Find the mutation in `packages/backend/convex/kernel/*.ts`
2. Check which events it creates in `schema.ts` events enum
3. Find the reducer that processes that event type in `reducer.ts`
4. Check `policies.ts` for what suggestions result

### 2. Event → Reducer → Policy Chain

```typescript
// 1. Events are defined in schema.ts
type EventType =
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "PLAN_SET"
  | "REST_ACCEPTED"
  // ... more events

// 2. Reducer processes events in computeDailyState()
function computeDailyState(day, events) {
  return events.reduce((state, event) => {
    switch (event.type) {
      case "TASK_COMPLETED":
        return { ...state, completedMinutes: state.completedMinutes + event.minutes };
      // ... more handlers
    }
  }, initialState);
}

// 3. Policies generate suggestions from state
function runPolicies(state: LifeState): Suggestion[] {
  if (state.mode === "recovery" && state.load === "overloaded") {
    return [SUGGESTION_TYPES.GENTLE_RETURN];
  }
  // ... more policies
}
```

**To trace a suggestion back**:

1. Find suggestion type in `policies.ts`
2. Find what state triggers it
3. Find what events create that state
4. Find where that event is created (commands)

### 3. Key Entry Points

| What you want        | Where to look                              |
| -------------------- | ------------------------------------------ |
| User creates task    | `taskCommands.ts:createTask()`             |
| User completes task  | `taskCommands.ts:completeTask()`           |
| User accepts rest    | `kernel/commands.ts:acceptRest()`          |
| Suggestions appear   | `kernel/policies.ts:runPolicies()`         |
| AI generates content | `kernel/vexAgents.ts:*` functions          |
| State is computed    | `kernel/reducer.ts:computeDailyState()`    |
| Calendar blocks      | `calendar.ts:addBlock()`                   |
| Journal entries      | `identity/journal.ts:createJournalEntry()` |

### 4. Call Graph Quick Reference

```
apps/native/app/_layout.tsx
  └─▶ ConvexBetterAuthProvider
        └─▶ apps/native/lib/auth-client.ts
              └─▶ packages/backend/convex/auth.ts

apps/native/app/(tabs)/index.tsx (Today screen)
  ├─▶ useQuery(api.kernel.commands.getToday)
  │     └─▶ kernel/commands.ts:getToday()
  │           └─▶ kernel/reducer.ts:computeDailyState()
  │                 └─▶ kernel/policies.ts:runPolicies()
  │
  ├─▶ useMutation(api.kernel.taskCommands.createTask)
  │     └─▶ kernel/taskCommands.ts:createTask()
  │           └─▶ kernel/commands.ts:executeCommand()
  │                 └─▶ events → reducer → policies
  │
  └─▶ useAction(api.kernel.vexAgents.generateAiSuggestions)
        └─▶ kernel/vexAgents.ts:generateAiSuggestions()
              └─▶ LLM API call → suggestions table

apps/native/contexts/auth-context.tsx
  └─▶ useQuery(api.auth.getCurrentUser)
        └─▶ packages/backend/convex/auth.ts:getCurrentUser()
```

---

## File Organization

```
life-os/
├── apps/native/
│   ├── app/
│   │   ├── _layout.tsx          # Root layout + providers
│   │   ├── (tabs)/              # Screen routes
│   │   │   ├── index.tsx        # Today (main dashboard)
│   │   │   ├── tasks.tsx
│   │   │   ├── journal.tsx
│   │   │   └── ...
│   │   └── sign-in.tsx / sign-up.tsx
│   ├── contexts/
│   │   └── auth-context.tsx     # Auth React context
│   ├── lib/
│   │   └── auth-client.ts       # Better Auth client config
│   └── ...
│
└── packages/backend/convex/
    ├── kernel/
    │   ├── commands.ts          # executeCommand, getToday
    │   ├── taskCommands.ts      # createTask, completeTask
    │   ├── taskQueries.ts       # getActiveTasks
    │   ├── policies.ts          # runPolicies (suggestions)
    │   ├── reducer.ts           # computeDailyState
    │   └── vexAgents.ts         # AI actions
    ├── identity/
    │   ├── journal.ts
    │   ├── weeklyReview.ts
    │   └── patterns.ts
    ├── calendar.ts
    ├── threads.ts
    ├── schema.ts                # Database schema + events
    ├── auth.ts                  # Auth integration
    ├── auth.config.ts           # Better Auth providers
    └── ...
```

---

## Debugging Tips

1. **"Where is this suggestion coming from?"**
   - Search `kernel/policies.ts` for the suggestion type name
   - See what `LifeState` triggers it
   - See what events create that state in `kernel/reducer.ts`

2. **"Why isn't my task showing up?"**
   - Check `taskCommands.ts:createTask()` was called
   - Check `schema.ts` tasks table has the task
   - Check `getToday()` query includes it in `stateDaily`

3. **"What happens when I click this button?"**
   - Find the `useMutation` or `useAction` call
   - Trace to the Convex function it calls
   - Follow the event → reducer → policy chain

4. **"Why did my state change?"**
   - Query `events` table for recent events on that day
   - Find the reducer handler for that event type
   - See if a policy generated a new suggestion

---

## Code Search Patterns

```bash
# Find all places that call a specific mutation
rg "useMutation\(api\.kernel\." apps/native/
rg "useAction\(api\.kernel\." apps/native/

# Find all places an event type is created
rg "type: 'TASK_" packages/backend/convex/
rg "eventType\." packages/backend/convex/

# Find all places a reducer handles an event
rg "case 'TASK_" packages/backend/convex/kernel/reducer.ts

# Find all places a policy generates a suggestion
rg "SUGGESTION_TYPES\." packages/backend/convex/kernel/policies.ts
```
