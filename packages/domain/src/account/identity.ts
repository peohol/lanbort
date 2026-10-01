import { DomainError } from "../errors";
import type { AuthenticationContext, AccountStatus, UserActor } from "../actor";
import type { DomainContext } from "../commands/command";
import { EventRecorder, writeEvents } from "../events/recorder";
import { sql } from "kysely";
import { accountCreated } from "./events";

/**
 * An identity as verified by the auth adapter, already stripped of vendor
 * types. Nothing in it comes from user-editable metadata.
 */
export interface AuthenticatedIdentity {
  readonly provider: "supabase";
  readonly subject: string;
  readonly email: string | null;
  /** Whether the provider has verified control of `email`. */
  readonly emailVerified: boolean;
  readonly authentication: AuthenticationContext;
}

function toActor(
  userId: string,
  status: string,
  identity: AuthenticatedIdentity,
): UserActor {
  return {
    kind: "user",
    userId,
    accountStatus: status as AccountStatus,
    authentication: identity.authentication,
  };
}

async function findLinkedUser(
  db: DomainContext["db"],
  identity: AuthenticatedIdentity,
) {
  return db
    .selectFrom("app.auth_identities as link")
    .innerJoin("app.users as user", "user.id", "link.user_id")
    .select(["user.id", "user.status"])
    .where("link.provider", "=", identity.provider)
    .where("link.subject", "=", identity.subject)
    .executeTakeFirst();
}

/**
 * Normalizes an authenticated identity into the internal actor model
 * (WP-10). The first time a verified identity is seen, an internal account is
 * created and linked to it; afterwards the link is only read.
 *
 * Returns null for identities without a verified e-mail address: such a
 * session is treated as not signed in (PS-USR-001).
 */
export async function resolveUserActor(
  domain: DomainContext,
  identity: AuthenticatedIdentity,
  correlationId?: string,
): Promise<UserActor | null> {
  if (!identity.emailVerified || !identity.email) {
    return null;
  }

  const existing = await findLinkedUser(domain.db, identity);

  if (existing) {
    return toActor(existing.id, existing.status, identity);
  }

  const email = identity.email.toLowerCase();

  return domain.db.transaction().execute(async (tx) => {
    // Concurrent first requests of the same identity create one account.
    const lockKey = JSON.stringify([
      "identity",
      identity.provider,
      identity.subject,
    ]);
    await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(
      tx,
    );

    const linked = await findLinkedUser(tx, identity);

    if (linked) {
      return toActor(linked.id, linked.status, identity);
    }

    const emailTaken = await tx
      .selectFrom("app.verified_contacts")
      .select("user_id")
      .where("kind", "=", "email")
      .where("address", "=", email)
      .executeTakeFirst();

    if (emailTaken) {
      // Another account already owns this address. Linking automatically
      // would merge identities; that is a controlled process (PS-ADM-009).
      throw new DomainError("conflict", "E-mail already belongs to an account");
    }

    const user = await tx
      .insertInto("app.users")
      .defaultValues()
      .returning(["id", "status"])
      .executeTakeFirstOrThrow();

    await tx
      .insertInto("app.auth_identities")
      .values({
        provider: identity.provider,
        subject: identity.subject,
        user_id: user.id,
      })
      .execute();

    await tx
      .insertInto("app.verified_contacts")
      .values({
        user_id: user.id,
        kind: "email",
        address: email,
        verified_at: new Date(),
      })
      .execute();

    const actor = toActor(user.id, user.status, identity);
    const events = new EventRecorder();
    events.record(accountCreated, { resourceId: user.id, payload: {} });
    await writeEvents(tx, events, {
      actor,
      correlationId: correlationId ?? null,
      consumers: domain.consumers,
    });

    return actor;
  });
}
