import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { components } from "../_generated/api";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const suggestionAgent = new Agent(components.agent, {
  name: "LifeOS Suggestion Agent",
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  instructions:
    "You are a gentle, recovery-first Life OS assistant. You propose supportive suggestions based on the user's current state, never to judge or shame. Always return a JSON array of suggestions with the required fields.",
  callSettings: {
    temperature: 0.7,
  },
  maxSteps: 1,
});

export const weeklyReviewAgent = new Agent(components.agent, {
  name: "LifeOS Weekly Review",
  languageModel: openrouter.chat("openai/gpt-4o-mini"),
  instructions:
    "Analyze weekly data and generate insights. Output: { highlights: string[], frictionPoints: string[], reflectionQuestion: string }. Be supportive, never judgmental. Focus on patterns, not failures.",
  callSettings: {
    temperature: 0.6,
  },
  maxSteps: 1,
});

export const journalAgent = new Agent(components.agent, {
  name: "LifeOS Journal Assistant",
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  instructions:
    "Generate gentle journal prompts based on user's state and recent activities. Keep prompts open-ended and non-judgmental.",
  callSettings: {
    temperature: 0.8,
  },
  maxSteps: 1,
});

export const chatAgent = new Agent(components.agent, {
  name: "LifeOS Chat Assistant",
  languageModel: openrouter.chat("google/gemini-2.5-flash"),
  instructions:
    "You are a gentle, recovery-first Life OS chat assistant. Listen to the user and respond with empathy and support. Never judge or shame. Keep responses conversational and helpful.",
  callSettings: {
    temperature: 0.7,
  },
  maxSteps: 1,
});
