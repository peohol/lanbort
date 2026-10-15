import { getEnvironment } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { environmentHref } from "@/navigation/routes";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { About, Requirements } from "../about";
import { environmentHome } from "../back";

export const metadata: Metadata = { title: "Om miljøet – Lånbort" };

/**
 * «Om miljøet» (Tomat): what the environment is, and for active members
 * the rules they have met (PS-ENV-005). Who is in it is on the
 * environment's page, and the user's own membership on «Mitt medlemskap».
 * Read through the environment's own policy, as on its page.
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
      {environment.membership?.state === "active" && (
        <Requirements requirements={environment.requirements} />
      )}
    </main>
  );
}
