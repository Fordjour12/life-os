Nice — Expo Router makes the structure really clean. Here’s the **exact starting blueprint** for a React Native + Convex **Life OS Kernel MVP** (server-first), with the smallest end-to-end loop working.

You’ll ship this loop first:

**Command → Event → State → Policy → Suggestion → Feedback → Event**

---

## Project structure

```
/Users/phantom/dev/life-os
├── AGENTS.md
├── AGENTS.md.bak
├── README.md
├── apps
│   └── native
│       ├── app
│       │   ├── (drawer)
│       │   │   ├── (tabs)
│       │   │   │   ├── _layout.tsx
│       │   │   │   ├── index.tsx
│       │   │   │   └── two.tsx
│       │   │   ├── _layout.tsx
│       │   │   └── index.tsx
│       │   ├── +not-found.tsx
│       │   ├── _layout.tsx
│       │   └── modal.tsx
│       ├── assets
│       │   └── images
│       │       ├── android-icon-background.png
│       │       ├── android-icon-foreground.png
│       │       ├── android-icon-monochrome.png
│       │       ├── favicon.png
│       │       ├── icon.png
│       │       ├── partial-react-logo.png
│       │       ├── react-logo.png
│       │       ├── react-logo@2x.png
│       │       ├── react-logo@3x.png
│       │       └── splash-icon.png
│       ├── components
│       │   ├── container.tsx
│       │   ├── sign-in.tsx
│       │   ├── sign-up.tsx
│       │   └── theme-toggle.tsx
│       ├── contexts
│       │   └── app-theme-context.tsx
│       ├── lib
│       │   └── auth-client.ts
│       ├── node_modules
│       ├── app.json
│       ├── global.css
│       ├── metro.config.js
│       ├── package.json
│       └── tsconfig.json
├── bts.jsonc
├── bun.lock
├── docs
│   ├── life-os-states.md
│   ├── life-os-with-local-first.md
│   ├── life-os.md
│   ├── manifesto.md
│   └── summary.md
├── node_modules
├── opencode.json
├── opencode.json.bak
├── package.json
├── packages
│   ├── backend
│   │   ├── convex
│   │   │   ├── README.md
│   │   │   ├── auth.config.ts
│   │   │   ├── auth.ts
│   │   │   ├── convex.config.ts
│   │   │   ├── healthCheck.ts
│   │   │   ├── http.ts
│   │   │   ├── privateData.ts
│   │   │   ├── schema.ts
│   │   │   └── tsconfig.json
│   │   ├── node_modules
│   │   └── package.json
│   ├── config
│   │   ├── package.json
│   │   └── tsconfig.base.json
│   └── env
│       ├── node_modules
│       ├── package.json
│       ├── src
│       │   └── native.ts
│       └── tsconfig.json
├── plan
│   └── 001-start.md
├── tsconfig.json
└── turbo.json
```

---

## 1) Kernel types (shared contract)

Create: `src/kernel/types.ts`

```ts
// src/kernel/types.ts

export type KernelCommand =
  | { cmd: "complete_task"; input: { taskId: string }; idempotencyKey: string }
  | {
      cmd: "set_daily_plan";
      input: { day: string; top3TaskIds: string[] };
      idempotencyKey: string;
    }
  | {
      cmd: "submit_feedback";
      input: { suggestionId: string; vote: "up" | "down" | "ignore" };
      idempotencyKey: string;
    };

export type KernelEvent =
  | { type: "TASK_COMPLETED"; ts: number; meta: { taskId: string } }
  | {
      type: "PLAN_SET";
      ts: number;
      meta: { day: string; top3TaskIds: string[] };
    }
  | {
      type: "SUGGESTION_FEEDBACK";
      ts: number;
      meta: { suggestionId: string; vote: "up" | "down" | "ignore" };
    };

export type LoadState = "underloaded" | "balanced" | "overloaded";
export type Momentum = "stalled" | "steady" | "strong";
export type FocusCapacity = "very_low" | "low" | "medium" | "high";
export type LifeMode = "recovery" | "maintain" | "build" | "sprint";

export type LifeState = {
  day: string; // YYYY-MM-DD
  mode: LifeMode;

  plannedMinutes: number;
  completedMinutes: number;
  freeMinutes: number;

  load: LoadState;
  momentum: Momentum;
  focusCapacity: FocusCapacity;

  reasons: Array<{ code: string; detail: string }>;
};

export type SuggestionStatus =
  | "new"
  | "accepted"
  | "downvoted"
  | "ignored"
  | "expired";

export type KernelSuggestion = {
  day: string;
  type: "PLAN_RESET" | "TINY_WIN" | "DAILY_REVIEW_QUESTION";
  priority: 1 | 2 | 3 | 4 | 5;
  reason: { code: string; detail: string };
  payload: Record<string, any>;
  status: SuggestionStatus;
  cooldownKey?: string;
};
```

This file is your “constitution”.

---

## 2) Convex schema (events, stateDaily, suggestions)

Create: `convex/schema.ts`

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    userId: v.string(),
    ts: v.number(),
    type: v.string(),
    meta: v.any(),
    idempotencyKey: v.string(),
  })
    .index("by_user_ts", ["userId", "ts"])
    .index("by_user_idem", ["userId", "idempotencyKey"]),

  stateDaily: defineTable({
    userId: v.string(),
    day: v.string(), // YYYY-MM-DD
    state: v.any(),
    updatedAt: v.number(),
  }).index("by_user_day", ["userId", "day"]),

  suggestions: defineTable({
    userId: v.string(),
    day: v.string(),
    type: v.string(),
    priority: v.number(),
    reason: v.any(),
    payload: v.any(),
    status: v.string(),
    cooldownKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_day", ["userId", "day"])
    .index("by_user_status", ["userId", "status"]),
});
```

---

## 3) Reducer: compute minimal daily state

Create: `convex/kernel/reducer.ts`

```ts
import type {
  LifeState,
  KernelEvent,
  LoadState,
  Momentum,
  FocusCapacity,
  LifeMode,
} from "../../src/kernel/types";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// MVP: freeMinutes is fixed until calendar integration exists
const DEFAULT_FREE_MINUTES = 240; // 4 hours

export function computeDailyState(
  day: string,
  events: KernelEvent[],
): LifeState {
  let completed = 0;

  // If you don’t have tasks yet, treat completion as fixed minutes per completion event.
  const COMPLETE_MINUTES = 25;

  // Planned minutes from PLAN_SET is temporary; later you’ll pull task estimates
  let planned = 0;

  for (const e of events) {
    if (e.type === "TASK_COMPLETED") completed += COMPLETE_MINUTES;
    if (e.type === "PLAN_SET") planned = 120; // temporary placeholder
  }

  const freeMinutes = DEFAULT_FREE_MINUTES;
  const ratio = planned / Math.max(1, freeMinutes);

  let load: LoadState = "balanced";
  if (ratio < 0.7) load = "underloaded";
  else if (ratio > 1.05) load = "overloaded";

  // Momentum MVP based on completed minutes
  let momentum: Momentum = "stalled";
  if (completed >= 25 && completed < 75) momentum = "steady";
  if (completed >= 75) momentum = "strong";

  // Focus capacity MVP: inferred from load + completion
  let focusCapacity: FocusCapacity = "medium";
  if (load === "overloaded" && completed < 25) focusCapacity = "low";
  if (completed >= 75) focusCapacity = "high";

  // Life mode MVP
  let mode: LifeMode = "maintain";
  const reasons: LifeState["reasons"] = [];

  if (
    load === "overloaded" &&
    (focusCapacity === "low" || focusCapacity === "very_low")
  ) {
    mode = "recovery";
    reasons.push({
      code: "MODE_TO_RECOVERY",
      detail: "Overloaded plan + low capacity signals",
    });
  }

  if (load === "overloaded")
    reasons.push({
      code: "OVERLOAD",
      detail: "Planned time exceeds available time",
    });
  if (momentum === "stalled")
    reasons.push({
      code: "MOMENTUM_LOW",
      detail: "No meaningful progress detected yet",
    });

  return {
    day,
    mode,
    plannedMinutes: planned,
    completedMinutes: completed,
    freeMinutes,
    load,
    momentum,
    focusCapacity,
    reasons,
  };
}
```

This is intentionally simple. You’ll refine later when tasks/calendar exist.

---

## 4) Policies: generate 0–3 suggestions

Create: `convex/kernel/policies.ts`

```ts
import type { LifeState, KernelSuggestion } from "../../src/kernel/types";

export function runPolicies(state: LifeState): KernelSuggestion[] {
  const out: KernelSuggestion[] = [];
  const day = state.day;

  // Policy 1: Overload Guard → Plan Reset
  if (state.load === "overloaded") {
    out.push({
      day,
      type: "PLAN_RESET",
      priority: 5,
      reason: {
        code: "OVERLOAD_GUARD",
        detail: "Your plan is heavier than your available time/energy.",
      },
      payload: { suggestedTopTasks: 1 },
      status: "new",
      cooldownKey: "plan_reset",
    });
  }

  // Policy 2: Momentum Builder → Tiny win
  if (state.momentum === "stalled") {
    out.push({
      day,
      type: "TINY_WIN",
      priority: 4,
      reason: {
        code: "MOMENTUM_BUILDER",
        detail: "A small win can restart momentum.",
      },
      payload: { maxMinutes: 10 },
      status: "new",
      cooldownKey: "tiny_win",
    });
  }

  // Policy 3: Daily Review (always at MVP; later schedule by time)
  out.push({
    day,
    type: "DAILY_REVIEW_QUESTION",
    priority: 2,
    reason: {
      code: "DAILY_REVIEW",
      detail: "Gentle reflection helps you reset without shame.",
    },
    payload: { question: "What’s one small thing you did today that counts?" },
    status: "new",
    cooldownKey: "daily_review",
  });

  // Resolver MVP: sort, cap to 3
  return out.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
```

---

## 5) Commands: single write entrypoint

Create: `convex/kernel/commands.ts`

```ts
import { mutation, query } from "convex/server";
import { v } from "convex/values";
import { computeDailyState } from "./reducer";
import { runPolicies } from "./policies";

function getTodayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// You’ll replace this with auth later.
function getUserId(): string {
  return "user_me";
}

export const executeCommand = mutation({
  args: {
    command: v.any(),
  },
  handler: async (ctx, { command }) => {
    const userId = getUserId();
    const now = Date.now();

    // Basic validation for MVP
    if (!command?.cmd || !command?.input || !command?.idempotencyKey) {
      throw new Error("Invalid command shape");
    }

    // Idempotency guard
    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) =>
        q.eq("userId", userId).eq("idempotencyKey", command.idempotencyKey),
      )
      .first();
    if (existing) {
      return { ok: true, deduped: true };
    }

    // Create event from command
    let eventType = "";
    let meta: any = {};
    let day = getTodayYYYYMMDD();

    if (command.cmd === "complete_task") {
      eventType = "TASK_COMPLETED";
      meta = { taskId: command.input.taskId };
    } else if (command.cmd === "set_daily_plan") {
      eventType = "PLAN_SET";
      meta = { day: command.input.day, top3TaskIds: command.input.top3TaskIds };
      day = command.input.day;
    } else if (command.cmd === "submit_feedback") {
      eventType = "SUGGESTION_FEEDBACK";
      meta = {
        suggestionId: command.input.suggestionId,
        vote: command.input.vote,
      };
    } else {
      throw new Error("Unknown command");
    }

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: eventType,
      meta,
      idempotencyKey: command.idempotencyKey,
    });

    // Pull today's events for state recompute
    const dayEvents = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    // Convert DB events to kernel events shape
    const kernelEvents = dayEvents.map((e) => ({
      type: e.type,
      ts: e.ts,
      meta: e.meta,
    }));

    const state = computeDailyState(day, kernelEvents as any);

    // Upsert stateDaily
    const existingState = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    if (existingState) {
      await ctx.db.patch(existingState._id, { state, updatedAt: now });
    } else {
      await ctx.db.insert("stateDaily", { userId, day, state, updatedAt: now });
    }

    // Generate suggestions (MVP: overwrite today's suggestions)
    const suggestions = runPolicies(state);

    // naive reset: mark existing as expired
    const existingSugs = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    for (const s of existingSugs) {
      if (s.status === "new")
        await ctx.db.patch(s._id, { status: "expired", updatedAt: now });
    }

    for (const s of suggestions) {
      await ctx.db.insert("suggestions", {
        userId,
        day: s.day,
        type: s.type,
        priority: s.priority,
        reason: s.reason,
        payload: s.payload,
        status: s.status,
        cooldownKey: s.cooldownKey,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ok: true, state, suggestionsCount: suggestions.length };
  },
});

export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const userId = getUserId();
    const day = getTodayYYYYMMDD();

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    return {
      day,
      state: stateDoc?.state ?? null,
      suggestions: suggestions
        .filter((s) => s.status === "new")
        .sort((a, b) => b.priority - a.priority),
    };
  },
});
```

That gives you an end-to-end kernel loop even before tasks/calendar exist.

---

## 6) React Native + Expo Router screens

### Convex client setup

Create: `src/lib/convex.ts`

```ts
import { ConvexReactClient } from "convex/react";

export const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL!,
);
```

In `app/_layout.tsx` wrap providers:

```tsx
import { Stack } from "expo-router";
import { ConvexProvider } from "convex/react";
import { convex } from "../src/lib/convex";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <Stack screenOptions={{ headerShown: false }} />
    </ConvexProvider>
  );
}
```

### Today screen: `app/(tabs)/today.tsx`

```tsx
import { View, Text, TouchableOpacity } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Today() {
  const data = useQuery(api.kernel.commands.getToday);
  const execute = useMutation(api.kernel.commands.executeCommand);

  const completeDemoTask = async () => {
    await execute({
      command: {
        cmd: "complete_task",
        input: { taskId: "demo_task" },
        idempotencyKey: idem(),
      },
    });
  };

  if (!data) return <Text>Loading...</Text>;

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Today</Text>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "700" }}>State</Text>
        <Text>Mode: {data.state?.mode ?? "—"}</Text>
        <Text>Load: {data.state?.load ?? "—"}</Text>
        <Text>Momentum: {data.state?.momentum ?? "—"}</Text>
        <Text>Focus: {data.state?.focusCapacity ?? "—"}</Text>
      </View>

      <TouchableOpacity
        onPress={completeDemoTask}
        style={{ padding: 12, borderRadius: 12, borderWidth: 1 }}
      >
        <Text>Complete demo task (creates event)</Text>
      </TouchableOpacity>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 }}>
        <Text style={{ fontWeight: "700" }}>Top suggestions</Text>
        {data.suggestions?.length ? (
          data.suggestions.map((s: any) => (
            <View
              key={s._id}
              style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}
            >
              <Text style={{ fontWeight: "700" }}>{s.type}</Text>
              <Text>{s.reason?.detail}</Text>
            </View>
          ))
        ) : (
          <Text>None</Text>
        )}
      </View>
    </View>
  );
}
```

### Inbox screen: `app/(tabs)/inbox.tsx`

```tsx
import { View, Text, TouchableOpacity } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Inbox() {
  const data = useQuery(api.kernel.commands.getToday);
  const execute = useMutation(api.kernel.commands.executeCommand);

  const vote = async (suggestionId: string, vote: "up" | "down" | "ignore") => {
    await execute({
      command: {
        cmd: "submit_feedback",
        input: { suggestionId, vote },
        idempotencyKey: idem(),
      },
    });
  };

  if (!data) return <Text>Loading...</Text>;

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Inbox</Text>

      {data.suggestions?.length ? (
        data.suggestions.map((s: any) => (
          <View
            key={s._id}
            style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 }}
          >
            <Text style={{ fontWeight: "800" }}>{s.type}</Text>
            <Text>{s.reason?.detail}</Text>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => vote(s._id, "up")}
                style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}
              >
                <Text>👍</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => vote(s._id, "down")}
                style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}
              >
                <Text>👎</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => vote(s._id, "ignore")}
                style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}
              >
                <Text>💤</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      ) : (
        <Text>No suggestions</Text>
      )}
    </View>
  );
}
```

---

## What you’ll have after this

Even with **no task system yet**, you’ll already have:

✅ an event log
✅ daily state computed from events
✅ policies that create suggestions
✅ an inbox to accept/downvote/ignore
✅ a closed feedback loop

That’s the kernel.

---

## Next development step (after kernel MVP works)

Add real domain objects in this order:

1. **Tasks** (create/complete → events, estimates feed plannedMinutes)
2. **Planner** (PLAN_SET becomes real: top3 tasks + planned minutes)
3. **Calendar blocks** (freeMinutes becomes real)
4. **Habits** (habit health + recovery mode gets smarter)
5. **AI proposals** (two-phase commit)

If you want, I can generate the **Tasks module next** (Convex tables + commands + UI) so `complete_task` stops being “demo” and becomes real.
