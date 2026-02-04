# Feature to UI Mapping

This document maps all features in the Life OS to their corresponding UI components and routes.

## Overview

Life OS is a recovery-first personal productivity system built on event-sourcing principles. The UI follows a machine aesthetic with hard edges, monospace typography, and high-contrast badges.

---

## 1. PLANNER (Daily Planning)

**Route:** `apps/native/app/(tabs)/planner.tsx`

**Purpose:** Set and manage daily focus items with kernel-driven state awareness.

**UI Components:**
- `HardCard` - Main container cards with machine aesthetic
- `MachineText` - System typography (header, label, value variants)
- `TextField` - Input for focus items and estimates
- `Button` - Actions with spinner states
- `Spinner` - Loading indicators
- `SuggestionInbox` - Nested component for AI suggestions

**Key Features:**
- State Matrix display (MODE, CAPACITY, LOAD, MOMENTUM, HABITS, FINANCE, PLAN_QUALITY)
- Free time / Plan time / Completion rate metrics
- Editor for focus items (up to 3)
- Action buttons: SAVE_PLAN, REST_DAY, CANCEL, ADJUST, PLAN_RESET, SHRINK_TO_1, START_SESSION, TINY_WIN
- Next step session with SMALLER/SKIP controls
- Event summary (habits done/missed, expenses)

---

## 2. INBOX (AI Suggestions)

**Route:** `apps/native/app/(tabs)/inbox.tsx`

**Purpose:** Review and interact with AI-generated suggestions.

**UI Components:**
- `HardCard` - Suggestion cards
- `Button` - Mode/status filters, voting actions
- `MachineText` - Labels and content

**Key Features:**
- Mode tabs: TODAY, RECENT_7D, QUEUE
- Status filters: NEW, HANDLED, ALL
- Suggestion cards with type, priority, reason detail
- Voting actions: USEFUL, NOT_USEFUL, IGNORE
- Grouped by day
- Thread navigation button (chatbubbles icon)

---

## 3. TIME REALITY (Calendar/Time Blocking)

**Route:** `apps/native/app/(tabs)/time-reality.tsx`

**Purpose:** Track time reality through calendar blocks and capacity calculations.

**UI Components:**
- `CalendarBlockCard` - Individual time blocks
- `HardCard` - Section containers
- `Button` - Day navigation, actions
- `MachineText` - Labels and values
- `Pressable` - Interactive elements

**Key Features:**
- Day selector with week strip navigation
- Calendar blocks with kinds: busy, focus, rest, personal
- Capacity metrics: FREE_TIME, EFFECTIVE_FREE, BUSY_COUNTS, FOCUS_BLOCKS, CAPACITY
- Block actions: Edit, Duplicate, Duplicate to Tomorrow, Remove
- Add busy time modal navigation

**Related Routes:**
- `apps/native/app/add-busy-time.tsx` - Add new blocks
- `apps/native/app/edit-busy-time.tsx` - Edit existing blocks

---

## 4. JOURNAL (Reflection Logs)

**Route:** `apps/native/app/(tabs)/journal.tsx`

**Purpose:** Browse and manage journal entries with mood tracking.

**UI Components:**
- `JournalEntryCard` - Individual entries
- `DayHeader` - Date grouping headers
- `HardCard` - Section containers
- `FilterButton` - Filter controls
- `TextField` - Search input
- `FlashList` - Virtualized list

**Key Features:**
- Mood filter: all, low, neutral, ok, good
- Window filter: 7d, 30d, all time
- Search by text, day, or mood
- Saved views with custom names
- Presets: ALL_TIME, LAST_7D, LOW_7D, GOOD_30D
- Delete entries with confirmation

---

## 5. TASKS (Execution Queue)

**Route:** `apps/native/app/(tabs)/tasks.tsx`

**Purpose:** Manage the task execution queue with AI-assisted next steps.

**UI Components:**
- `HardCard` - Task cards and form
- `Button` - Actions (DONE, NEXT_STEP, RESUME)
- `TextField` - Task input
- `Spinner` - Loading states

**Key Features:**
- Create tasks with title and estimate
- Active queue display
- Paused tasks with show/hide toggle
- Complete tasks
- Resume paused tasks
- AI-powered next step generation
- Apply AI-generated next steps

---

## 6. WEEKLY REVIEW

**Route:** `apps/native/app/(tabs)/weekly-review.tsx`

**Purpose:** Weekly retrospective and planning with AI assistance.

**UI Components:**
- `WeeklyReviewCard` - Weekly stats display
- `AIDraftSection` - AI-generated narrative
- `WeeklyPlanSection` - Day-by-day planning
- `DriftSignalsCard` - Pattern deviation alerts
- `PatternInsightsCard` - Behavioral insights
- `HardCard` - Section containers

**Key Features:**
- Weekly stats: recoveryDays, balancedDays, tinyWins, planResits
- AI draft generation with narrative
- Apply daily plans individually or all at once
- Pattern insights (week window)
- Drift signals (month window)

---

## 7. TODAY (Home Dashboard)

**Route:** `apps/native/app/(tabs)/index.tsx`

**Purpose:** Single view of system state, today's events, and quick actions.

**UI Components:**
- `DailyIntentCard` - Today's plan display
- `WeeklyReviewCard` - Weekly summary
- `JournalPromptCard` - Reflection prompts
- `PatternInsightsCard` - Insights display
- `DriftSignalsCard` - Alert display
- `TaskCard` - Individual task display
- `HardCard` - Section containers
- `EngBadge` - System state badges
- `Button` - Quick actions
- `TextField` - Quick log inputs

**Key Features:**
- System Status row: SYS.LOAD, FLUX, CPU, PWR
- Today Events: habits done/missed, expenses
- Quick Log: habit tracking, expense logging
- Daily Intent display with progress
- Weekly Review with AI narrative
- Pattern Insights (week window)
- Drift Signals (month window)
- Recovery Protocol (when in recovery mode)
- Journal Prompt with submit/skip/regenerate
- AI Suggestions with actionable responses
- Execution Queue with quick add

---

## 8. CALENDAR IMPORT

**Route:** `apps/native/app/import-calendar.tsx`

**Purpose:** Import calendar events from ICS URLs.

**UI Components:**
- `HardCard` - Form container
- `TextField` - URL input
- `Button` - Import/Close actions
- `Spinner` - Loading state

**Key Features:**
- Paste ICS URL
- Import with validation
- Result display: imported/skipped counts

---

## 9. THREADS (Conversations)

**Routes:**
- `apps/native/app/threads/index.tsx` - Thread list
- `apps/native/app/threads/[threadId].tsx` - Individual thread

**UI Components:**
- `ThreadList` - List of conversation threads
- `ChatMessage` - Individual messages
- `ChatInput` - Message input

**Key Features:**
- View conversation history
- AI-human dialogue threads
- Thread navigation

---

## 10. AUTHENTICATION

**Routes:**
- `apps/native/app/sign-in.tsx` - Sign in
- `apps/native/app/sign-up.tsx` - Sign up

**UI Components:**
- `SignIn` - Sign in form component
- `SignUp` - Sign up form component
- `HardCard` - Form containers

---

## 11. BOOT SEQUENCE

**Route:** `apps/native/app/boot.tsx`

**Purpose:** Initial app loading and setup.

**UI Components:**
- `BootSequence` - Animated boot sequence
- `BootGate` - Conditional rendering based on setup state

---

## 12. REusable UI COMPONENTS

### Layout Components
- `Container` - Main layout wrapper
- `HardCard` - Card container with border/shadow variants
- `GlassCard` - Glassmorphism card (when needed)

### Typography
- `MachineText` - Monospace text with variants: header, label, value

### Form Elements
- `FilterButton` - Toggle filter buttons
- `ToggleSwitch` - Boolean toggle
- `StatusBadge` - Status indicators

### Display Components
- `CalendarBlockCard` - Calendar block display
- `JournalEntryCard` - Journal entry display
- `TaskCard` - Task display
- `DailyIntentCard` - Daily plan display
- `WeeklyReviewCard` - Weekly stats display
- `DriftSignalsCard` - Alerts display
- `PatternInsightsCard` - Insights display
- `JournalPromptCard` - Journal prompt display
- `SuggestionInbox` - Suggestions list

### Skeletons
- `TodaySkeleton` - Loading state for Today
- `PlannerSkeleton` - Loading state for Planner
- `InboxSkeleton` - Loading state for Inbox
- `TasksSkeleton` - Loading state for Tasks
- `JournalSkeleton` - Loading state for Journal
- `WeeklyReviewSkeleton` - Loading state for Weekly Review
- `TimeRealitySkeleton` - Loading state for Time Reality

### Weekly Review Components
- `AIDraftSection` - AI narrative section
- `WeeklyPlanSection` - Planning section

### Thread Components
- `ChatMessage` - Message bubble
- `ThreadList` - List view
- `ChatInput` - Input field
- `ThreadTypes` - Type definitions

---

## DESIGN SYSTEM

### Styling Approach
- **Uniwind** (Tailwind for React Native) for all styling
- Hard edges, no border-radius
- High contrast borders
- Monospace typography (Menlo font)
- Machine/system aesthetic

### Color Semantics
- **accent** - Primary actions, highlights
- **success** - Positive states, good metrics
- **warning** - Caution states, medium metrics
- **danger** - Critical states, negative metrics
- **foreground** - Primary text
- **background** - Background
- **surface** - Card backgrounds
- **muted** - Secondary backgrounds
- **divider** - Borders

### Component Variants
- `HardCard`: default, flat, variants with different border styles
- `Button`: Various sizes and states
- `MachineText`: header, label, value variants

---

## DATA FLOW

### Event Sourcing
All features read from the event log (`events` table):
- Events are the source of truth
- UI never mutates reality directly
- Commands produce events
- State is derived via reducers

### Tables
- `events` - All system events
- `tasks` - Task queue
- `calendarBlocks` - Time blocks
- `journalEntries` - Journal reflections
- `suggestions` - AI suggestions
- `stateDaily` - Daily state snapshots
- `weeklyReviews` - Weekly retrospectives

### Kernel Commands
All user actions execute through the kernel command system:
- `set_daily_plan` - Update daily focus
- `complete_task` - Mark task done
- `log_habit` - Track habits
- `add_expense` - Log expenses
- `accept_rest` - Rest protocols
- `submit_feedback` - Vote on suggestions

---

## NAVIGATION STRUCTURE

```
tabs/
├── index.tsx (Today)
├── planner.tsx
├── inbox.tsx
├── tasks.tsx
├── time-reality.tsx
├── journal.tsx
└── weekly-review.tsx

modal.tsx
import-calendar.tsx
add-busy-time.tsx
edit-busy-time.tsx
boot.tsx
sign-in.tsx
sign-up.tsx
threads/
├── index.tsx
└── [threadId].tsx
```

---

## FILENAME CONVENTIONS

- Screens: `PascalCase.tsx` (e.g., `WeeklyReview.tsx`)
- Components: `kebab-case.tsx` (e.g., `task-card.tsx`)
- Hooks: `useX.ts` or `use-x.ts`
- Types: `*.types.ts` or co-located with component
