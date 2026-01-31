import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const createThread = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runMutation(internal.agent.threads.createThread, {
      title: args.title,
    });
    return { threadId: thread._id };
  },
});

export const listThreads = query({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runQuery(
      internal.agent.threads.listThreadsByUserId,
      {
        order: "desc",
        paginationOpts: {
          cursor: args.cursor ?? null,
          numItems: args.numItems ?? 20,
        },
      },
    );

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

export const getMessages = query({
  args: {
    threadId: v.string(),
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runQuery(
      internal.agent.messages.listMessagesByThreadId,
      {
        threadId: args.threadId,
        order: "asc",
        paginationOpts: {
          cursor: args.cursor ?? null,
          numItems: args.numItems ?? 50,
        },
      },
    );

    return {
      messages: result.page.map((msg) => {
        const content = msg.message?.content;
        return {
          id: msg._id,
          role: msg.message?.role ?? "user",
          content: typeof content === "string" ? content : "",
          timestamp: msg._creationTime,
        };
      }),
      cursor: result.continueCursor,
    };
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.agent.messages.addMessages, {
      messages: [
        {
          message: {
            role: "user",
            content: args.content,
          },
        },
      ],
    });
    return { success: true };
  },
});

export const deleteThread = mutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.agent.threads.deleteAllForThreadIdSync, {
      threadId: args.threadId,
    });
    return { success: true };
  },
});
