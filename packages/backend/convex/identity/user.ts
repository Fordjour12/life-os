import { query } from "../_generated/server";

function getUserId(): string {
  return "user_me";
}

export const getCurrentUserId = query({
  args: {},
  handler: async () => {
    return { userId: getUserId() };
  },
});
