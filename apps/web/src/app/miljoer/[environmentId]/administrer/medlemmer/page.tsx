import { listMemberships, listRoles } from "@lanbort/domain";
import { MenuList, MenuRow } from "@/components/menu-list";
import {
  administrationPageHref,
  administrationPages,
} from "@/presentation/environment-admin";
import { pageQueryOrNotFound } from "@/server/session";
import {
  type AdministrationParams,
  AdministrationHeader,
  administrationMetadata,
  loadAdministrationTask,
} from "../administration";
import { Members, Restrictions } from "../members";

export const metadata = administrationMetadata("members");

/** The members, and who is barred from new attempts (PS-ENV-004). */
export default async function MembersPage({
  params,
}: {
  params: AdministrationParams;
}) {
  const { account, environment } = await loadAdministrationTask(params);
  const environmentId = environment.id;
  const [memberships, roles] = await Promise.all([
    pageQueryOrNotFound(listMemberships, { environmentId }),
    pageQueryOrNotFound(listRoles, { environmentId }),
  ]);

  return (
    <main>
      <AdministrationHeader environment={environment} page="members" />
      <Members
        environmentId={environmentId}
        memberships={memberships.memberships}
        holders={roles.holders}
        ownUserId={account.userId}
      />
      <Restrictions
        environmentId={environmentId}
        restrictions={memberships.restrictions}
      />
      <MenuList>
        <MenuRow
          href={administrationPageHref(environmentId, "memberships")}
          icon="person"
          label={administrationPages.memberships.title}
        />
      </MenuList>
    </main>
  );
}
