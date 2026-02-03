import { createThread as createAgentThread, listUIMessages, saveMessage } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { action, mutation, query } from "./_generated/server";
import { requireAuthUser } from "./auth";
import { chatAgent } from "./kernel/agents";

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

    const threads = await Promise.all(
      result.page.map(async (thread) => {
        const messages = await listUIMessages(ctx, components.agent, {
          threadId: thread._id,
          paginationOpts: { cursor: null, numItems: 1 },
        });
        const lastMessage = messages.page[0];
        return {
          id: thread._id,
          title: thread.title ?? "New Conversation",
          summary: thread.summary,
          lastMessage: lastMessage?.text ?? "",
          lastMessageRole: lastMessage?.role ?? "user",
          createdAt: thread._creationTime,
          updatedAt: thread._creationTime,
        };
      })
    );

    return {
      threads,
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

export const sendMessageWithResponse: ReturnType<typeof action> = action({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx: ActionCtx, args: { threadId: string; content: string }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId,
      message: {
        role: "user",
        content: args.content,
      },
    });

    const result = await chatAgent.generateText(
      ctx,
      { threadId: args.threadId, userId },
      { prompt: args.content },
    );

    return { response: result.text };
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
