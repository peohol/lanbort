import {
  type PlatformLookup,
  platformLookupResultSchema,
  platformLookupSchema,
  type PlatformLookupResult,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { AccountStatus } from "../actor";
import { realNames } from "../account/store";
import { rateLimits } from "../abuse/rate-limits";
import { defineCommand } from "../commands/command";
import { actingUserId, loadObjectState } from "../objects/state";
import { platformSubjectLookedUp } from "./events";
import { type LookupFinding, lookUpPlatformSubjectPolicy } from "./policies";

type Found = NonNullable<PlatformLookupResult["found"]>;

/** Accounts that are not there to act on, as for an inquiry. */
const absent: readonly AccountStatus[] = ["pending_registration", "deleted"];

async function findAccount(
  db: Kysely<Database>,
  lookup: Exclude<PlatformLookup, { by: "object" }>,
): Promise<{ userId: string; status: AccountStatus } | null> {
  const row = await (
    lookup.by === "email"
      ? db
          .selectFrom("app.verified_contacts as contact")
          .innerJoin("app.users as user", "user.id", "contact.user_id")
          .select(["user.id", "user.status"])
          .where("contact.kind", "=", "email")
          .where("contact.address", "=", lookup.email)
      : db
          .selectFrom("app.users as user")
          .select(["user.id", "user.status"])
          .where("user.id", "=", lookup.userId)
  ).executeTakeFirst();
  const status = row?.status as AccountStatus | undefined;

  return row && status && !absent.includes(status)
    ? { userId: row.id, status }
    : null;
}

async function find(
  db: Kysely<Database>,
  lookup: PlatformLookup,
  stewardId: string,
): Promise<Found | null> {
  if (lookup.by === "object") {
    const object = await loadObjectState(db, lookup.objectId);

    if (!object) return null;

    const names = await realNames(db, object.ownerIds);

    return {
      kind: "object",
      objectId: object.objectId,
      title: object.title,
      ownerNames: object.ownerIds.flatMap((id) => names.get(id) ?? []),
      involved: object.ownerIds.includes(stewardId),
    };
  }

  const account = await findAccount(db, lookup);

  if (!account) return null;

  const names = await realNames(db, [account.userId]);

  return {
    kind: "user",
    ...account,
    name: names.get(account.userId) ?? null,
    involved: account.userId === stewardId,
  };
}

/**
 * OD-0055: a steward finds the account or thing an inquiry or a duplicate
 * is about from its full e-mail address or the link to its page, never by
 * searching names. Every lookup is recorded with how it was made and
 * whether it found anything, found or not, and counts toward the lookup
 * rate limit. What is found is only named here; acting on it is each
 * operation's own decision.
 */
export const lookUpPlatformSubject = defineCommand({
  name: "platform.look_up_subject",
  input: platformLookupSchema,
  output: platformLookupResultSchema,
  policy: lookUpPlatformSubjectPolicy,
  idempotency: "none",
  rateLimit: rateLimits.lookups,
  load: async ({ tx, actor, input }) => ({
    resource: {
      found: await find(tx, input, actingUserId(actor)),
    } satisfies LookupFinding,
    context: undefined,
  }),
  execute: async ({ input, resource, events }) => {
    const { found } = resource;

    events.record(platformSubjectLookedUp, {
      resourceId: found
        ? found.kind === "user"
          ? found.userId
          : found.objectId
        : "none",
      payload: { by: input.by, found: found !== null },
    });

    return resource;
  },
});
