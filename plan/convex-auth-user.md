# Create / Query using Authenticated Enpoints

- For a Query (read from the db): This principle is that queries should be idempotent, meaning that they should have the same effect if they are executed multiple times. This is important for ensuring that the state of the database is consistent and predictable.
  Check the user's permissions before performing the query. This can be done by checking the user's role or by checking if the user has the necessary permissions to perform the query. This is important for ensuring that the user is authorized to perform the query.

```ts
import { query } from "./_generated/server";
import { authComponent } from "./auth";

export const getUser = query({
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(
      ctx as unknown as Parameters<typeof authComponent.safeGetAuthUser>[0],
    );
    if (!authUser) throw new Error("Not authenticated");
    return authUser;
  },
});
```

- For a Mutation (write to the db): This principle is that mutations should be idempotent, meaning that they should have the same effect if they are executed multiple times. This is important for ensuring that the state of the database is consistent and predictable.
  Check the user's permissions before performing the mutation. This can be done by checking the user's role or by checking if the user has the necessary permissions to perform the mutation. This is important for ensuring that the user is authorized to perform the mutation.

```ts
import { mutation } from "./_generated/server";
import { authComponent } from "./auth";

export const getUser = query({
  args:{/* it can be any type of input */}
  handler: async (ctx, args) => {
    const authUser = await authComponent.safeGetAuthUser(
      ctx as unknown as Parameters<typeof authComponent.safeGetAuthUser>[0],
    );
    if (!authUser) throw new Error("Not authenticated");

    return authUser;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return identity;
  },
});

```
