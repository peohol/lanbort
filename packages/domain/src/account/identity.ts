import { DomainError } from "../errors";
import {
  type AccountStatus,
  type AuthenticationContext,
  type PlatformRole,
  platformRoles,
  type UserActor,
} from "../actor";
import { type DomainContext, executeCommand } from "../commands/command";
import { EventRecorder, writeEvents } from "../events/recorder";
import { sql } from "kysely";
import { recordMfaEnabled } from "./commands";
import { accountCreated, mfaEnabled } from "./events";

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

interface UserRow {
  readonly id: string;
  readonly status: string;
  readonly platform_roles: readonly string[];
  readonly mfa_recorded: boolean;
}

function isPlatformRole(role: string): role is PlatformRole {
  return (platformRoles as readonly string[]).includes(role);
}

function toActor(row: UserRow, identity: AuthenticatedIdentity): UserActor {
  return {
    kind: "user",
    userId: row.id,
    accountStatus: row.status as AccountStatus,
    authentication: identity.authentication,
    platformRoles: row.platform_roles.filter(isPlatformRole),
  };
}

async function findLinkedUser(
  db: DomainContext["db"],
  identity: AuthenticatedIdentity,
) {
  return db
    .selectFrom("app.auth_identities as link")
    .innerJoin("app.users as user", "user.id", "link.user_id")
    .select([
      "user.id",
      "user.status",
      // Read on every request, so a revoked role stops working immediately.
      sql<string[]>`array(
        select grant_row.role from app.platform_role_grants as grant_row
        where grant_row.user_id = "user".id and grant_row.revoked_at is null
        order by grant_row.role
      )`.as("platform_roles"),
      sql<boolean>`exists(
        select 1 from app.audit_events as event
        where event.resource_type = ${mfaEnabled.resourceType}
          and event.resource_id = "user".id::text
          and event.event_type = ${mfaEnabled.type}
      )`.as("mfa_recorded"),
    ])
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

  const row =
    (await findLinkedUser(domain.db, identity)) ??
    (await createLinkedUser(
      domain,
      { ...identity, email: identity.email },
      correlationId,
    ));
  const actor = toActor(row, identity);

  if (actor.authentication.assurance !== "aal2" || row.mfa_recorded) {
    return actor;
  }

  // A session raised with the authenticator app (aal2) is only accepted once
  // the confirmed app is in the audit history. The provider confirms the app
  // outside our transaction, so a record lost to a failure right after that
  // is repaired here, before any request can use the raised session; if the
  // repair fails, the request fails with it.
  if (actor.accountStatus === "active") {
    await executeCommand(domain, recordMfaEnabled, {
      actor,
      input: {},
      correlationId,
    });
    return actor;
  }

  // Only active accounts can add an app, so there is nothing to record; the
  // unrecorded raise is simply not trusted.
  return {
    ...actor,
    authentication: { ...actor.authentication, assurance: "aal1" },
  };
}

/** First sight of a verified identity: a new internal account. */
async function createLinkedUser(
  domain: DomainContext,
  identity: AuthenticatedIdentity & { email: string },
  correlationId: string | undefined,
): Promise<UserRow> {
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
      return linked;
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

    const created = { ...user, platform_roles: [], mfa_recorded: false };
    const actor = toActor(created, identity);
    const events = new EventRecorder();
    events.record(accountCreated, { resourceId: user.id, payload: {} });
    await writeEvents(tx, events, {
      actor,
      correlationId: correlationId ?? null,
      consumers: domain.consumers,
    });

    return created;
  });
}
