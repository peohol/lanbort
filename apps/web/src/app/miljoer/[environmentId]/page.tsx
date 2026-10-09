import {
  calendarDate,
  getEnvironment,
  listEnvironmentObjects,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { environmentAboutHref, environmentHref } from "@/navigation/routes";
import { membershipStep, roleName } from "@/presentation/environments";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { About, MembersOnly } from "./about";
import { environmentBack } from "./back";
import { Things } from "./member-content";
import { Membership } from "./membership";

export const metadata: Metadata = { title: "Miljøet – Lånbort" };

/** The query parameter for the next page of things. */
const afterParam = "etter";

/**
 * An environment as a context (UX-IA-004, WP-84, Tomat kjerneflyt 3):
 * before joining, what it is and what it asks of members (UX-JRN-002) and
 * the way in; for active members its things, with the rest («Om miljøet
 * og medlemmer») a page away. What the caller may see is decided by each
 * query's own policy; a hidden environment looks like nothing at all to
 * outsiders (UX-PRIV-002).
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
  const things = active
    ? await pageQuery(listEnvironmentObjects, {
        environmentId,
        ...(typeof after === "string" ? { cursor: after } : {}),
      })
    : null;
  const role = roleName(environment.roles);
  const member = environment.membership !== null;

  return (
    <main>
      <PageHeader
        title={environment.name}
        kind="Miljø"
        back={environmentBack(environment)}
        context={role && <Tag>Du er {role.toLowerCase()}</Tag>}
      >
        {environment.location}
      </PageHeader>
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
      {member ? (
        <MenuList>
          <MenuRow
            href={environmentAboutHref(environmentId)}
            icon="people"
            label={
              active ? "Om miljøet og medlemmer" : "Om miljøet og medlemskapet"
            }
          />
        </MenuList>
      ) : (
        <>
          <About environment={environment} />
          <MembersOnly />
        </>
      )}
    </main>
  );
}
