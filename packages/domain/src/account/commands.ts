import { completeRegistrationSchema } from "@lanbort/contracts";
import { z } from "zod";
import type { AccountStatus } from "../actor";
import { defineCommand } from "../commands/command";
import { registrationCompleted } from "./events";
import { completeRegistrationPolicy } from "./policies";

/**
 * UX-JRN-001 step 3: real name and 18+ confirmation activate the account.
 * Retry-safe, so a double submit cannot create two profiles.
 */
export const completeRegistration = defineCommand({
  name: "account.complete_registration",
  input: completeRegistrationSchema,
  output: z.strictObject({ status: z.literal("active") }),
  policy: completeRegistrationPolicy,
  idempotency: "required",
  actorAccount: "change",
  load: async ({ tx, actor }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const user = await tx
      .selectFrom("app.users")
      .select(["id", "status"])
      .where("id", "=", actor.userId)
      .forUpdate()
      .executeTakeFirst();

    return user
      ? {
          resource: { userId: user.id, status: user.status as AccountStatus },
          context: undefined,
        }
      : null;
  },
  execute: async ({ tx, input, resource, events, now }) => {
    await tx
      .insertInto("app.profiles")
      .values({ user_id: resource.userId, real_name: input.realName })
      .execute();

    await tx
      .updateTable("app.users")
      .set({ status: "active", adult_confirmed_at: now })
      .where("id", "=", resource.userId)
      .execute();

    events.record(registrationCompleted, {
      resourceId: resource.userId,
      payload: {},
    });

    return { status: "active" as const };
  },
});
