import { getSocialOverview, listMemberships } from "@lanbort/domain";
import { pageQuery, pageQueryOrNotFound } from "@/server/session";
import {
  type AdministrationParams,
  AdministrationHeader,
  administrationMetadata,
  loadAdministrationTask,
} from "../administration";
import { Memberships } from "../memberships";

export const metadata = administrationMetadata("memberships");

/** Applications, reactivation requests and invitations (PS-ENV-001–010). */
export default async function MembershipsPage({
  params,
}: {
  params: AdministrationParams;
}) {
  const { account, environment } = await loadAdministrationTask(params);
  const [memberships, social] = await Promise.all([
    pageQueryOrNotFound(listMemberships, { environmentId: environment.id }),
    environment.type === "open" ? null : pageQuery(getSocialOverview, {}),
  ]);

  return (
    <main>
      <AdministrationHeader environment={environment} page="memberships" />
      <Memberships
        environment={environment}
        memberships={memberships}
        friends={social?.friends ?? []}
        ownUserId={account.userId}
      />
    </main>
  );
}
