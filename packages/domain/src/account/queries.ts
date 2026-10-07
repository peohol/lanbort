import type {
  AccountStatusReason,
  OwnAccount,
  ProfilePictureVisibility,
} from "@lanbort/contracts";
import { z } from "zod";
import type { AccountStatus } from "../actor";
import { defineQuery } from "../commands/query";
import { takesNewActivity } from "./model";
import { readOwnAccount } from "./policies";

/**
 * The signed-in user's own account, profile with its picture, and verified
 * e-mail.
 */
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
      .leftJoin("app.profile_pictures as picture", "picture.user_id", "user.id")
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
        "profile.picture_visibility",
        "picture.id as picture_id",
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
            picture: {
              // Pictures are served to active accounts only, so one that is
              // not active is shown its initials instead.
              pictureId: takesNewActivity(row.status as AccountStatus)
                ? row.picture_id
                : null,
              // A profile is shown generally until its owner chooses otherwise.
              visibility: (row.picture_visibility ??
                "general") as ProfilePictureVisibility,
            },
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
    picture: resource.picture,
  }),
});
