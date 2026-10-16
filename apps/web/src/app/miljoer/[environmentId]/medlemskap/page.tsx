import { getEnvironment } from "@lanbort/domain";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { environmentHref } from "@/navigation/routes";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { environmentHome } from "../back";
import { YourMembership } from "../membership";

export const metadata: Metadata = { title: "Mitt medlemskap – Lånbort" };

/**
 * «Mitt medlemskap» (Tomat): writing to the administrators, and leaving.
 * Without an active or passive membership, or once the environment is
 * wound down, the environment's page is where the user belongs.
 */
export default async function YourMembershipPage({
  params,
}: {
  params: Promise<{ environmentId: string }>;
}) {
  await requirePageAccount();
  const { environmentId } = await params;
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });
  const state = environment.membership?.state;

  if (
    (state !== "active" && state !== "passive") ||
    environment.woundDownAt !== null
  ) {
    redirect(environmentHref(environmentId));
  }

  return (
    <main>
      <PageHeader
        title="Mitt medlemskap"
        back={{
          href: environmentHref(environment.id),
          label: environment.name,
        }}
        home={environmentHome(environment)}
      >
        {environment.name}
      </PageHeader>
      <YourMembership environment={environment} />
    </main>
  );
}
