import type { AccountBindingSource } from "../account/bindings";

/**
 * PS-ADM-004: the owner of an environment hands it over or winds it down
 * before the account can be deleted. Administrator roles, invitations and
 * claims are not bindings: they end with the account
 * (`releaseEnvironmentRoles`).
 */
export const environmentOwnershipBindings: AccountBindingSource = {
  name: "environment_ownership",
  load: async (db, userId) => {
    const rows = await db
      .selectFrom("app.environment_role_grants")
      .select("environment_id")
      .where("user_id", "=", userId)
      .where("role", "=", "owner")
      .where("revoked_at", "is", null)
      .orderBy("environment_id")
      .execute();

    return rows.map((row) => ({
      kind: "environment_ownership" as const,
      resourceId: row.environment_id,
    }));
  },
};
