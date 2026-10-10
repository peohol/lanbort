import type { Metadata } from "next";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { passkeysHref, platformQueueHref } from "@/navigation/stewardship";
import {
  passkeyCountText,
  queueCounts,
  queueCountsText,
  queueLockedText,
  stewardStanding,
} from "@/presentation/stewardship";
import { requirePageAccount } from "@/server/session";
import { getOpenPlatformCases, requireStewardship } from "@/server/stewardship";
import { StewardStatus } from "./steward-status";
import { StewardRole } from "./steward-role";

export const metadata: Metadata = { title: "Forvaltning – Lånbort" };

/**
 * «Forvaltning» (PS-ADM-015, ADR-0011, Tomat «Plattformforvaltning v1»):
 * the platform steward's task page, like «Administrer miljøet». What waits
 * first, then the steward's tools, then what is not done in the app. Only a
 * steward reaches it; anyone else sees «not found».
 */
export default async function StewardshipPage() {
  const account = await requirePageAccount();
  const steward = await requireStewardship();
  const standing = stewardStanding(steward);
  const queue = await getOpenPlatformCases();
  const counts = queue && queueCounts(queue.items, account.userId);

  return (
    <main>
      <PageHeader title="Forvaltning" kind="Lånbort" home="home" />
      <StewardRole steward={steward} />
      <StewardStatus
        steward={steward}
        unassigned={counts?.unassigned ?? null}
      />
      <section aria-labelledby="venter">
        <h2 id="venter">Venter på deg</h2>
        <MenuList label="venter">
          <MenuRow
            href={counts ? platformQueueHref() : undefined}
            icon="flag"
            label="Plattformkøen"
            detail={
              counts
                ? queueCountsText(counts)
                : queueLockedText[standing as keyof typeof queueLockedText]
            }
            end={
              counts && counts.unassigned > 0 ? (
                <Tag tone="attention">{counts.unassigned}</Tag>
              ) : undefined
            }
          />
        </MenuList>
      </section>
      <section aria-labelledby="forvaltning">
        <h2 id="forvaltning">Forvaltning</h2>
        <MenuList label="forvaltning">
          <MenuRow
            href={steward.enabled ? passkeysHref : undefined}
            icon="lock"
            label="Passkeys"
            detail={
              steward.enabled
                ? passkeyCountText(
                    steward.passkeys.length,
                    steward.minimum,
                    steward.maximum,
                  )
                : "Slått av i produksjon"
            }
          />
        </MenuList>
      </section>
      <section aria-labelledby="ikke-i-appen">
        <h2 id="ikke-i-appen">Ikke i appen</h2>
        <MenuList label="ikke-i-appen">
          <MenuRow
            label="Utnevne og fjerne forvaltere"
            detail="Gjøres av driftsansvarlig"
          />
          <MenuRow
            label="Tilbakestille en annen forvalters passkeys"
            detail="Gjøres av driftsansvarlig"
          />
        </MenuList>
      </section>
    </main>
  );
}
