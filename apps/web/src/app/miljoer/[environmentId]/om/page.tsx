import { getEnvironment, listEnvironmentMembers } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { environmentHref } from "@/navigation/routes";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { About, Requirements } from "../about";
import { environmentHome } from "../back";
import { Members } from "../member-content";
import { YourMembership } from "../membership";

export const metadata: Metadata = { title: "Om miljøet – Lånbort" };

/**
 * «Om miljøet og medlemmer» (Tomat kjerneflyt 3): what the environment is,
 * for active members who is in it (vision 03) and the rules they have met
 * (PS-ENV-005), and the user's own membership: writing to the
 * administrators and leaving. Each part is read through its own query's
 * policy, as on the environment's page.
 */
export default async function EnvironmentAboutPage({
  params,
}: {
  params: Promise<{ environmentId: string }>;
}) {
  await requirePageAccount();
  const { environmentId } = await params;
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });
  const active = environment.membership?.state === "active";
  const members = active
    ? await pageQuery(listEnvironmentMembers, { environmentId })
    : null;

  return (
    <main>
      <PageHeader
        title={`Om ${environment.name}`}
        label="Om miljøet"
        back={{
          href: environmentHref(environment.id),
          label: environment.name,
        }}
        home={environmentHome(environment)}
      />
      <About environment={environment} />
      {members && <Members members={members.members} />}
      {active && <Requirements requirements={environment.requirements} />}
      <YourMembership environment={environment} />
    </main>
  );
}
