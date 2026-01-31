import { createThread as createAgentThread, listMessages, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

function getUserId(): string {
  return "user_me";
}

export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = getUserId();
    const threadId = await createAgentThread(ctx, components.agent, {
      userId,
      title: args.title,
    });
    return { threadId };
  },
});

export const listConversations = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = getUserId();
    const result = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId,
      order: "desc",
      paginationOpts: {
        cursor: args.cursor ?? null,
        numItems: args.numItems ?? 20,
      },
    });

    return {
      threads: result.page.map((thread) => ({
        id: thread._id,
        title: thread.title,
        summary: thread.summary,
        createdAt: thread._creationTime,
        updatedAt: thread._creationTime,
      })),
      cursor: result.continueCursor,
    };
  },
});

export const getConversationMessages = query({
  args: {
    threadId: v.string(),
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      excludeToolMessages: true,
      paginationOpts: {
        cursor: args.cursor ?? null,
        numItems: args.numItems ?? 50,
      },
    });

    return {
      messages: result.page.map((msg) => {
        const content = msg.message?.content;
        const role = msg.message?.role ?? "user";
        return {
          id: msg._id,
          role: role === "tool" ? "assistant" : role,
          content: typeof content === "string" ? content : "",
          timestamp: msg._creationTime,
        };
      }),
      cursor: result.continueCursor,
    };
  },
});

export const addMessage = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = getUserId();
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId,
      message: {
        role: "user",
        content: args.content,
      },
    });
    return { messageId };
  },
});

export const deleteConversation = mutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: args.threadId,
    });
    return { success: true };
  },
});
