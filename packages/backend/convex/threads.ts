import { createThread as createAgentThread, listUIMessages, saveMessage } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { api } from "./_generated/api";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;
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
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;
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
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const addMessage = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;
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
