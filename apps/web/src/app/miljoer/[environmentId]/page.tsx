import {
  calendarDate,
  getEnvironment,
  listEnvironmentAdministrationTasks,
  listEnvironmentObjects,
  searchObjects,
} from "@lanbort/domain";
import { searchTextSchema } from "@lanbort/contracts";
import type { Metadata } from "next";
import { ErrorText } from "@/components/error-text";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { Tag } from "@/components/tag";
import {
  environmentAboutHref,
  environmentHref,
  welcomeParam,
} from "@/navigation/routes";
import { membershipStep, roleName, welcome } from "@/presentation/environments";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { About, MembersOnly, Requirements } from "./about";
import { AdministrationTasks } from "./administration-tasks";
import { environmentBack } from "./back";
import styles from "./environment.module.css";
import { FoundThings, Things } from "./member-content";
import { ForgetParam } from "./forget-param";
import { Membership } from "./membership";

export const metadata: Metadata = { title: "Miljøet – Lånbort" };

/** The query parameter for the next page of things. */
const afterParam = "etter";

/** What a member searches for among the things here, as in Finn. */
const searchParam = "q";

/**
 * An environment as a context (UX-IA-004, WP-84, Tomat kjerneflyt 3):
 * before joining, what it is and what it asks of members (UX-JRN-002) and
 * the way in; for active members its things, with the rest («Om miljøet
 * og medlemmer») a page away, and a search among the things («Søk i …»).
 * Arriving right after joining, the new member is welcomed. What the caller may see is decided by each
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
  const account = await requirePageAccount();
  const [{ environmentId }, query] = await Promise.all([params, searchParams]);
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });
  const step = membershipStep(environment);
  const active = environment.membership?.state === "active";
  const after = query[afterParam];
  const administrator = environment.roles.includes("administrator");
  const searched = query[searchParam];
  const q = typeof searched === "string" ? searched.trim() : "";
  const search = q ? searchTextSchema.safeParse(q) : null;
  const [found, things, tasks] = await Promise.all([
    active && search?.success
      ? pageQuery(searchObjects, { q: search.data, environmentId })
      : null,
    active && !search?.success
      ? pageQuery(listEnvironmentObjects, {
          environmentId,
          ...(typeof after === "string" ? { cursor: after } : {}),
        })
      : null,
    // The administrators' tasks here, counted as on Home (UX-JRN-012).
    administrator && active
      ? pageQuery(listEnvironmentAdministrationTasks, { environmentId })
      : null,
  ]);
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
      <ForgetParam name={welcomeParam} />
      <Membership
        environment={environment}
        step={step}
        welcomed={welcomeParam in query ? welcome(account.realName) : undefined}
      />
      {administrator && (
        <AdministrationTasks
          environmentId={environmentId}
          tasks={tasks ?? []}
        />
      )}
      {active && (
        <form
          role="search"
          method="get"
          action={environmentHref(environmentId)}
          className={styles.search}
        >
          <SearchField
            id="miljo-q"
            label={`Søk i ${environment.name}`}
            name={searchParam}
            defaultValue={q}
          />
          {search && !search.success && (
            <ErrorText>Skriv minst to tegn.</ErrorText>
          )}
        </form>
      )}
      {found && (
        <FoundThings
          environment={environment}
          q={q}
          found={found}
          today={calendarDate(new Date())}
        />
      )}
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
          <Requirements
            requirements={environment.requirements}
            heading="For å bli med"
          />
          <MembersOnly />
        </>
      )}
    </main>
  );
}
