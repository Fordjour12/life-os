import { createThread as createAgentThread, listUIMessages, saveMessage } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAuthUser } from "./auth";

export const createConversation: ReturnType<typeof mutation> = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args: { title?: string }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const threadId = await createAgentThread(ctx, components.agent, {
      userId,
      title: args.title,
    });
    return { threadId };
  },
});

export const listConversations: ReturnType<typeof query> = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, args: { cursor?: string; numItems?: number }) => {
    const user = await requireAuthUser(ctx);
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

export const getConversationMessages: ReturnType<typeof query> = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx: QueryCtx,
    args: { threadId: string; paginationOpts: { cursor: string | null; numItems: number } },
  ) => {
    return listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const addMessage: ReturnType<typeof mutation> = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx: MutationCtx, args: { threadId: string; content: string }) => {
    const user = await requireAuthUser(ctx);
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

export const deleteConversation: ReturnType<typeof mutation> = mutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx: MutationCtx, args: { threadId: string }) => {
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: args.threadId,
    });
    return { success: true };
  },
});
