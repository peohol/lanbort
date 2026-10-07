import {
  calendarDate,
  getEnvironment,
  listEnvironmentMembers,
  listEnvironmentObjects,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ContextTag, Tag } from "@/components/tag";
import { findHref, homeHref } from "@/navigation/areas";
import { environmentHref } from "@/navigation/routes";
import {
  environmentTypeNames,
  membershipStep,
  roleName,
} from "@/presentation/environments";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { About, Requirements } from "./about";
import { Members, Things } from "./member-content";
import { Membership } from "./membership";

export const metadata: Metadata = { title: "Miljøet – Lånbort" };

/** The query parameter for the next page of things. */
const afterParam = "etter";

/**
 * An environment as a context (UX-IA-004, WP-84): what it is and what it
 * asks of members before joining (UX-JRN-002), the way in, and for active
 * members its things, its other members and the administrators. What the
 * caller may see is decided by each query's own policy; a hidden
 * environment looks like nothing at all to outsiders (UX-PRIV-002).
 */
export default async function EnvironmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ environmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccount();
  const [{ environmentId }, query] = await Promise.all([params, searchParams]);
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });
  const step = membershipStep(environment);
  const active = environment.membership?.state === "active";
  const after = query[afterParam];
  const [things, members] = active
    ? await Promise.all([
        pageQuery(listEnvironmentObjects, {
          environmentId,
          ...(typeof after === "string" ? { cursor: after } : {}),
        }),
        pageQuery(listEnvironmentMembers, { environmentId }),
      ])
    : [null, null];
  const role = roleName(environment.roles);

  return (
    <main>
      <PageHeader
        title={environment.name}
        back={
          environment.membership
            ? { href: homeHref, label: "Hjem" }
            : { href: `${findHref}?vis=miljoer`, label: "Finn" }
        }
        context={
          <>
            <ContextTag label="Miljøtype">
              {environmentTypeNames[environment.type]}
            </ContextTag>
            {role && <Tag>Du er {role.toLowerCase()}</Tag>}
          </>
        }
      />
      <Membership environment={environment} step={step} />
      {things && (
        <Things
          environment={environment}
          things={things}
          today={calendarDate(new Date())}
          nextHref={(cursor) =>
            `${environmentHref(environmentId)}?${new URLSearchParams({ [afterParam]: cursor })}`
          }
          paged={typeof after === "string"}
        />
      )}
      {members && <Members members={members.members} />}
      <About environment={environment} />
      {active && <Requirements requirements={environment.requirements} />}
    </main>
  );
}
