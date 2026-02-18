import { expo } from "@better-auth/expo";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";

import type { DataModel } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

import { components } from "./_generated/api";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const nativeAppUrl = process.env.NATIVE_APP_URL;

export const authComponent = createClient<DataModel>(components.betterAuth);

function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    trustedOrigins: [nativeAppUrl!],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      expo(),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  });
}

export { createAuth };

export async function requireAuthUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const authUser = await authComponent.safeGetAuthUser(
    ctx as unknown as Parameters<typeof authComponent.safeGetAuthUser>[0],
  );
  if (!authUser) throw new Error("Not authenticated");
  return authUser;
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(
      ctx as unknown as Parameters<typeof authComponent.safeGetAuthUser>[0],
    );
  },
});
