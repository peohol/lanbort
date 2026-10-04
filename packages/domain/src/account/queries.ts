import type { AccountStatusReason, OwnAccount } from "@lanbort/contracts";
import { z } from "zod";
import type { AccountStatus } from "../actor";
import { defineQuery } from "../commands/query";
import { readOwnAccount } from "./policies";

/** The signed-in user's own account, profile and verified e-mail. */
export const getOwnAccount = defineQuery({
  name: "account.read",
  input: z.strictObject({}),
  policy: readOwnAccount,
  load: async ({ db, actor }) => {
    if (actor.kind !== "user") {
      return null;
    }

    const row = await db
      .selectFrom("app.users as user")
      .leftJoin("app.profiles as profile", "profile.user_id", "user.id")
      .leftJoin("app.verified_contacts as contact", (join) =>
        join
          .onRef("contact.user_id", "=", "user.id")
          .on("contact.kind", "=", "email"),
      )
      .select([
        "user.id",
        "user.status",
        "user.status_reason",
        "profile.real_name",
        "contact.address",
      ])
      .where("user.id", "=", actor.userId)
      .executeTakeFirst();

    return row
      ? {
          resource: {
            userId: row.id,
            status: row.status as AccountStatus,
            statusReason: row.status_reason as AccountStatusReason | null,
            realName: row.real_name,
            email: row.address,
          },
          context: undefined,
        }
      : null;
  },
  present: ({ resource }): OwnAccount => ({
    userId: resource.userId,
    status: resource.status,
    statusReason: resource.statusReason,
    realName: resource.realName,
    email: resource.email,
  }),
});
