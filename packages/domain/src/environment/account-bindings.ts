import type { AccountBindingSource } from "../account/bindings";

/**
 * PS-ADM-004: the owner of an environment hands it over or winds it down
 * before the account can be deleted. Once winding down has started, the
 * ownership binds no longer: the environment finishes winding down without
 * an owner (`vacateOwnership`). Administrator roles, invitations and claims
 * are not bindings: they end with the account (`releaseEnvironmentRoles`).
 */
export const environmentOwnershipBindings: AccountBindingSource = {
  name: "environment_ownership",
  load: async (db, userId) => {
    const rows = await db
      .selectFrom("app.environment_role_grants as grant")
      .innerJoin(
        "app.environments as environment",
        "environment.id",
        "grant.environment_id",
      )
      .select("grant.environment_id")
      .where("grant.user_id", "=", userId)
      .where("grant.role", "=", "owner")
      .where("grant.revoked_at", "is", null)
      .where("environment.state", "=", "active")
      .orderBy("grant.environment_id")
      .execute();

    return rows.map((row) => ({
      kind: "environment_ownership" as const,
      resourceId: row.environment_id,
    }));
  },
};
