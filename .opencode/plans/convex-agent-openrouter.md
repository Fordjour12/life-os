# Convex Agent Integration Plan with OpenRouter

## Overview

This skill covers the Convex Agent component (`@convex-dev/agent`) which provides a powerful abstraction for building AI agents in your Convex backend. Combined with OpenRouter, you get access to hundreds of models through a unified API.

## Current State

**Already Installed:**

- `@convex-dev/agent` - Installed and configured in `convex.config.ts`
- `@openrouter/ai-sdk-provider` - Installed in backend package
- `ai` - AI SDK core library

**Current Usage:**

- `aiSuggest.ts` uses `@ai-sdk/openai` directly instead of OpenRouter
- Agent is configured with OpenAI's GPT-4o-mini
- Environment variable: `OPENAI_API_KEY`

## Key Concepts

### Agent Architecture

- **Agent**: Central orchestrator that handles LLM calls, tool execution, and message management
- **Threads**: Conversation contexts that persist message history
- **Tools**: Functions the agent can call (both Convex mutations/actions and external APIs)
- **Messages**: Stored conversation history with metadata
- **Context**: How messages are retrieved and provided to the LLM

## Implementation Steps

### Phase 1: Core Migration (15 minutes)

**1. Update Environment Variables**

```bash
# Current
OPENAI_API_KEY=sk-...

# New
OPENROUTER_API_KEY=sk-or-v1-...
```

**2. Update aiSuggest.ts**
Replace:

```typescript
import { openai } from "@ai-sdk/openai";

const aiSuggestAgent = new Agent(components.agent, {
  languageModel: openai.chat("gpt-4o-mini"),
  // ...
});

const apiKey = process.env.OPENAI_API_KEY;
```

With:

```typescript
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const aiSuggestAgent = new Agent(components.agent, {
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  // ...
});

const apiKey = process.env.OPENROUTER_API_KEY;
```

**3. Update Dependencies**
Optionally remove `@ai-sdk/openai` if not used elsewhere:

```bash
bun remove @ai-sdk/openai
```

### Phase 2: Enhanced Features (1-2 hours)

**1. Add More AI Capabilities**

Create specialized agents for different features:

```typescript
// convex/kernel/agents.ts

// Suggestion agent (existing, migrated)
export const suggestionAgent = new Agent(components.agent, {
  name: "LifeOS Suggestion Agent",
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  instructions: "Generate recovery-first suggestions...",
  maxSteps: 1,
});

// Weekly review agent (new)
export const weeklyReviewAgent = new Agent(components.agent, {
  name: "LifeOS Weekly Review",
  languageModel: openrouter.chat("openai/gpt-4o-mini"), // Cheaper for summaries
  instructions: "Analyze weekly data and generate insights...",
});

// Journal reflection agent (new)
export const journalAgent = new Agent(components.agent, {
  name: "LifeOS Journal Assistant",
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  instructions: "Generate gentle journal prompts based on user's state...",
});
```

**2. Structured Output Pattern**

Use for type-safe AI responses:

```typescript
import { z } from "zod";

const suggestionSchema = z.object({
  type: z.enum(["TINY_WIN", "PLAN_RESET", "GENTLE_RETURN"]),
  priority: z.number().min(1).max(5),
  reason: z.object({
    code: z.string(),
    detail: z.string().max(240),
  }),
  payload: z.record(z.any()),
});

export const generateStructuredSuggestions = suggestionAgent.asObjectAction({
  args: { context: v.string() },
  outputSchema: z.array(suggestionSchema),
  handler: async (ctx, { context }) => {
    const { threadId } = await suggestionAgent.createThread(ctx, {
      userId: getUserId(),
      title: "structured-suggestions",
    });

    const result = await suggestionAgent.generateObject(
      ctx,
      { threadId, userId: getUserId() },
      {
        prompt: `Generate suggestions: ${context}`,
        schema: suggestionSchema,
      }
    );

    return result.object;
  },
});
```

**3. Tool Integration Pattern**

Add tools for agent to interact with Convex:

```typescript
import { createTool } from "@convex-dev/agent";

const getTaskById = createTool({
  description: "Fetch a task by its ID",
  args: z.object({
    taskId: v.id("tasks"),
  }),
  handler: async (ctx, { taskId }): Promise<string> => {
    const task = await ctx.db.get(taskId);
    return JSON.stringify(task);
  },
});

const agentWithTools = new Agent(components.agent, {
  ...baseConfig,
  tools: { getTaskById },
  maxSteps: 3, // Allow tool calls
});
```

### Phase 3: Advanced Features (Optional)

**1. Streaming Responses**

For real-time AI interactions:

```typescript
export const streamSuggestions = suggestionAgent.asStreamingAction({
  args: { prompt: v.string() },
  handler: async (ctx, { prompt }) => {
    const { threadId } = await suggestionAgent.createThread(ctx, {
      userId: getUserId(),
      title: "streamed-suggestions",
    });

    return await suggestionAgent.streamText(
      ctx,
      { threadId, userId: getUserId() },
      { prompt }
    );
  },
});
```

**2. Embeddings & RAG**

For context-aware suggestions:

```typescript
const agentWithEmbeddings = new Agent(components.agent, {
  ...baseConfig,
  textEmbedding: openrouter.textEmbedding("openai/text-embedding-3-small"),
  contextOptions: {
    vectorSearch: true,
    searchOptions: {
      limit: 10,
      messageRange: { before: 2, after: 1 },
    },
  },
});
```

**3. Cost Tracking**

Monitor AI usage:

```typescript
const trackedAgent = new Agent(components.agent, {
  ...baseConfig,
  usageHandler: async (ctx, { model, usage }) => {
    await ctx.runMutation(internal.analytics.trackUsage, {
      model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    });
  },
});
```

## OpenRouter Model Selection Guide

### Cost-Effective Options

| Model                              | Use Case        | Cost     |
| ---------------------------------- | --------------- | -------- |
| `meta-llama/llama-3.1-8b-instruct` | Simple tasks    | Very Low |
| `openai/gpt-4o-mini`               | Balanced        | Low      |
| `anthropic/claude-3-haiku`         | Quick responses | Low      |

### High Quality Options

| Model                                | Use Case            | Cost   |
| ------------------------------------ | ------------------- | ------ |
| `anthropic/claude-3.5-sonnet`        | Nuanced suggestions | Medium |
| `openai/gpt-4o`                      | Complex reasoning   | Higher |
| `meta-llama/llama-3.1-405b-instruct` | Long context        | Medium |

### Quick Reference

```typescript
// Chat models (recommended)
openrouter.chat("anthropic/claude-3.5-sonnet")

// Completion models
openrouter.completion("meta-llama/llama-3.1-405b-instruct")

// Embedding models (for RAG)
openrouter.textEmbedding("openai/text-embedding-3-small")
```

## Testing Strategy

### 1. Convex Playground

Add to `convex/playground.ts`:

```typescript
import { definePlaygroundAPI } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { suggestionAgent } from "./kernel/agents";

export const {
  isApiKeyValid,
  listAgents,
  listUsers,
  listThreads,
  listMessages,
  createThread,
  generateText,
} = definePlaygroundAPI(components.agent, {
  agents: [suggestionAgent],
});
```

Run:

```bash
npx @convex-dev/agent-playground
```

### 2. Manual Testing

```bash
# Test suggestion generation
bun run -C packages/backend convex run kernel.aiSuggest:generateAiSuggestions -- '{"day":"2026-01-31"}'
```

### 3. Type Checking

```bash
bun run check-types
```

## Migration Checklist

- [ ] Backup current `aiSuggest.ts`
- [ ] Update environment variable to `OPENROUTER_API_KEY`
- [ ] Replace OpenAI import with OpenRouter
- [ ] Test suggestion generation
- [ ] Verify cost/usage tracking (if enabled)
- [ ] Run type checker
- [ ] Update AGENTS.md documentation

## Best Practices for Life OS

### 1. Recovery-First Prompts

```typescript
const instructions = `You are a recovery-first Life OS assistant.
  - Never shame or judge the user
  - Propose, don't demand
  - Validate rest as a valid state
  - Focus on gentle progress
  - Always provide human-readable reasons`;
```

### 2. Context Truncation

```typescript
function truncateContext<T>(obj: T, maxDepth = 3): T {
  // Prevent token overflow
  // Implementation in aiSuggest.ts already exists
}
```

### 3. Rate Limiting

```typescript
// Daily caps already implemented
const DAILY_SUGGESTION_CAP = 3;

// Cooldown keys prevent repetition
const TWELVE_HOURS = 12 * 60 * 60 * 1000;
```

### 4. Error Handling

```typescript
// Graceful degradation
if (!apiKey) {
  console.log("[aiSuggest] No API key, skipping AI call");
  return { status: "skipped", reason: "no_api_key" };
}

// Try-catch around AI calls
try {
  const result = await agent.generateText(...);
} catch (error) {
  console.error("[aiSuggest] Error:", error);
  return { status: "error", fallback: [] };
}
```

## Resources

- [Convex Agent Docs](https://docs.convex.dev/agents)
- [OpenRouter Docs](https://openrouter.ai/docs)
- [AI SDK Docs](https://sdk.vercel.ai/docs)
- [OpenRouter Provider Repo](https://github.com/OpenRouterTeam/ai-sdk-provider)

## Next Steps

1. **Get OpenRouter API Key** from https://openrouter.ai/keys
2. **Choose preferred model** (Claude 3.5 Sonnet recommended)
3. **Run migration** (Phase 1 - 15 minutes)
4. **Test in app** - Trigger AI suggestions in UI
5. **Consider Phase 2** enhancements based on user feedback
