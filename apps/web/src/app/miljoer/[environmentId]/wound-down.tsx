import type { Environment } from "@lanbort/contracts";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { Tag } from "@/components/tag";
import { environmentCasesHref } from "@/navigation/cases";
import { formatDate } from "@/presentation/dates";
import {
  describeMembership,
  membershipLabel,
} from "@/presentation/environments";
import { About } from "./about";
import { environmentBack } from "./back";

/**
 * A wound-down environment (PS-ENV-012, UX-IA-023), as its members find it
 * in their archive: what it was and when it ended, read-only, with nothing
 * to do. What still goes on from it is in its own place: loans under Lån,
 * cases under Saker, and for its administrators the cases left open here.
 */
export function WoundDownEnvironment({
  environment,
  woundDownAt,
}: {
  environment: Environment;
  woundDownAt: string;
}) {
  const step = { kind: "wound_down" } as const;

  return (
    <main>
      <PageHeader
        title={environment.name}
        back={environmentBack(environment)}
        context={<Tag>{membershipLabel(environment, step)}</Tag>}
      >
        {environment.location}
      </PageHeader>
      <StatusCard
        status={describeMembership(environment, step)}
        when={`Siden ${formatDate(woundDownAt)}`}
      >
        <p>
          Bare de som var medlemmer da det ble avviklet, finner det igjen, under
          «Avviklede miljøer» i Hjem. Lån og saker fra miljøet finner du som før
          under Lån og Saker.
        </p>
      </StatusCard>
      <About environment={environment} />
      {environment.roles.includes("administrator") && (
        <p className="link-row">
          <Link href={environmentCasesHref(environment.id)}>
            Saker i miljøet
          </Link>
        </p>
      )}
    </main>
  );
}
