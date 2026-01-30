# Gentle Return V3

This is the next layer after Gentle Return P2. It makes the suggestion feel calm and earned.

## Goals

- Only suggest when it is safe and supportive
- Rotate away from tasks that were already suggested or recently resumed
- Keep the reason explicit and human

## V3 Signals

1. Wins: at least one completed task today
2. Capacity: medium or high focus capacity
3. Stability streak: 2 consecutive stable days
4. Time remaining: at least 60 minutes free

## Gating Rules

Show Gentle Return when all of these are true:

- Not overloaded
- Not in recovery
- Has wins or has capacity
- Has stability streak or has time remaining

## Rotation Rules

When choosing the paused task to suggest:

- Exclude tasks suggested as Gentle Return within 7 days
- Exclude tasks resumed within 7 days
- Exclude the last suggested Gentle Return task
- Then pick the smallest remaining task
- If everything is excluded, fall back to the smallest paused task

## Why Copy

Reason should mention the trigger:

- Wins: "Nice—momentum is back. Want to gently bring back one small task?"
- Capacity: "Your capacity looks okay. Want to gently bring back one small task?"
- Time: "You have time left today. Want to gently bring back one small task?"

## Data Additions

- Add `completedTasksCount` to `LifeState`
- Add `userKernelPrefs` table with `lastGentleReturnTaskId`

## Implementation Notes

- Rotation uses existing `suggestions` + `events` history
- No UI changes required
