import { listMemberships, listRoles } from "@lanbort/domain";
import { pageQueryOrNotFound } from "@/server/session";
import {
  type AdministrationParams,
  AdministrationHeader,
  administrationMetadata,
  loadAdministrationTask,
} from "../administration";
import { Roles } from "../roles";

export const metadata = administrationMetadata("roles");

/** Who administers the environment, and its owner (PS-ENV-003, -013). */
export default async function RolesPage({
  params,
}: {
  params: AdministrationParams;
}) {
  const { account, environment } = await loadAdministrationTask(params);
  const environmentId = environment.id;
  const [roles, memberships] = await Promise.all([
    pageQueryOrNotFound(listRoles, { environmentId }),
    pageQueryOrNotFound(listMemberships, { environmentId }),
  ]);

  return (
    <main>
      <AdministrationHeader environment={environment} page="roles" />
      <Roles
        environment={environment}
        roles={roles}
        members={memberships.memberships}
        ownUserId={account.userId}
      />
    </main>
  );
}
