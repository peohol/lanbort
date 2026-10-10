import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { stewardshipHref } from "@/navigation/stewardship";
import { stewardStanding } from "@/presentation/stewardship";
import { requirePageAccount } from "@/server/session";
import { requireStewardship } from "@/server/stewardship";
import { StewardRole } from "../steward-role";
import { StewardStatus } from "../steward-status";
import { InquiryFlow } from "./inquiry-flow";

export const metadata: Metadata = { title: "Åpne saksgrunnlag – Lånbort" };

/**
 * «Åpne saksgrunnlag» (PS-ADM-015, «Plattformforvaltning v1»): where an
 * intervention does not start from a report, the steward first opens a
 * case of their own. Finding what it is about needs a confirmed session,
 * like the queue; until then the page says what opens it.
 */
export default async function InquiryPage() {
  await requirePageAccount();
  const steward = await requireStewardship();

  return (
    <main>
      <PageHeader
        title="Åpne saksgrunnlag"
        kind="Lånbort"
        back={{ href: stewardshipHref, label: "Forvaltning" }}
      />
      <StewardRole steward={steward} />
      {stewardStanding(steward) === "confirmed" ? (
        <InquiryFlow freshUntil={steward.freshUntil} />
      ) : (
        <StewardStatus steward={steward} unassigned={null} />
      )}
    </main>
  );
}
