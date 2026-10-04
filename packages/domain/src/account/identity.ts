import { DomainError } from "../errors";
import {
  type AccountStatus,
  type AuthenticationContext,
  type PlatformRole,
  platformRoles,
  type UserActor,
} from "../actor";
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

interface UserRow {
  readonly id: string;
  readonly status: string;
  readonly platform_roles: readonly string[];
}

function isPlatformRole(role: string): role is PlatformRole {
  return (platformRoles as readonly string[]).includes(role);
}

/**
 * Sign-in methods Lånbort accepts as the stronger authentication that
 * privileged roles require (`aal2`). The mechanism is not decided (OD-0010),
 * so none is accepted yet: privileged access stays closed whatever the auth
 * provider reports, until a decided mechanism is added here together with an
 * audited way to set it up.
 */
const strongAuthenticationMethods: readonly string[] = [];

/** The provider's assurance, counted only with an accepted stronger method. */
function trustedAuthentication(
  authentication: AuthenticationContext,
): AuthenticationContext {
  const strong = authentication.methods.some(({ method }) =>
    strongAuthenticationMethods.includes(method),
  );

  return authentication.assurance === "aal2" && !strong
    ? { ...authentication, assurance: "aal1" }
    : authentication;
}

function toActor(row: UserRow, identity: AuthenticatedIdentity): UserActor {
  return {
    kind: "user",
    userId: row.id,
    accountStatus: row.status as AccountStatus,
    authentication: trustedAuthentication(identity.authentication),
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
 * session is treated as not signed in (PS-USR-001). So is a session of a
 * deleted account, until its identity is removed (PS-ADM-006): a deleted
 * account is never returned to anybody, and no new one is linked in its
 * place meanwhile.
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

  return row.status === "deleted" ? null : toActor(row, identity);
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

    const created = { ...user, platform_roles: [] };
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
