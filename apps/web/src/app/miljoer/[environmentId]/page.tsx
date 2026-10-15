import {
  calendarDate,
  getEnvironment,
  listAddableObjects,
  listEnvironmentAdministrationTasks,
  listEnvironmentMembers,
  listEnvironmentObjects,
  listObjectCategories,
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
  environmentMembershipHref,
  welcomeParam,
} from "@/navigation/routes";
import { membershipStep, roleName, welcome } from "@/presentation/environments";
import {
  readThingFilter,
  type ThingFilter,
  thingFilterHref,
} from "@/presentation/thing-list";
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
import { Members } from "./members";
import { Membership } from "./membership";

export const metadata: Metadata = { title: "Miljøet – Lånbort" };

/** What a member searches for among the things here, as in Finn. */
const searchParam = "q";

/**
 * An environment as a context (UX-IA-004, WP-84, Tomat kjerneflyt 3):
 * before joining, what it is and what it asks of members (UX-JRN-002) and
 * the way in; for active members who is in it (PS-ENV-015), a search among
 * the things («Søk i …») and the things, with «Om miljøet» and «Mitt
 * medlemskap» a page away. An active membership is the «Medlem» tag under
 * the title; arriving right after joining, the new member is welcomed.
 * What the caller may see is decided by each query's own policy; a hidden
 * environment looks like nothing at all to outsiders (UX-PRIV-002).
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
  const administrator = environment.roles.includes("administrator");
  const searched = query[searchParam];
  const q = typeof searched === "string" ? searched.trim() : "";
  const search = q ? searchTextSchema.safeParse(q) : null;
  const takesThings = active && environment.state === "active";
  const [found, things, tasks, members, addable, categories] =
    await Promise.all([
      active && search?.success
        ? pageQuery(searchObjects, { q: search.data, environmentId })
        : null,
      active && !search?.success
        ? pageQuery(listEnvironmentObjects, { environmentId })
        : null,
      // The administrators' tasks here, counted as on Home (UX-JRN-012).
      administrator && active
        ? pageQuery(listEnvironmentAdministrationTasks, { environmentId })
        : null,
      active ? pageQuery(listEnvironmentMembers, { environmentId }) : null,
      takesThings && !search?.success
        ? pageQuery(listAddableObjects, { environmentId })
        : null,
      active ? pageQuery(listObjectCategories, {}) : null,
    ]);
  const today = calendarDate(new Date());
  // A filter keeps the search, but not the one-time welcome.
  const kept = Object.fromEntries(
    Object.entries(query).filter(([name]) => name !== welcomeParam),
  );
  const filter = {
    chosen: readThingFilter(query),
    href: (chosen: ThingFilter) =>
      thingFilterHref(environmentHref(environmentId), kept, chosen),
  };
  const role = roleName(environment.roles);
  const state = environment.membership?.state;

  return (
    <main>
      <PageHeader
        title={environment.name}
        back={environmentBack(environment)}
        context={
          (step.kind === "member" || role) && (
            <>
              {step.kind === "member" && <Tag tone="positive">Medlem</Tag>}
              {role && <Tag>Du er {role.toLowerCase()}</Tag>}
            </>
          )
        }
      >
        {environment.location}
      </PageHeader>
      <ForgetParam name={welcomeParam} />
      <Membership
        environment={environment}
        step={step}
        welcomed={welcomeParam in query ? welcome(account.realName) : undefined}
      />
      {members && (
        <Members
          others={members.members}
          me={{
            userId: account.userId,
            realName: account.realName,
            profileId: account.userId,
            pictureId: account.picture.pictureId,
            roles: environment.roles,
          }}
        />
      )}
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
          categories={categories?.categories ?? []}
          filter={filter}
          today={today}
        />
      )}
      {things && (
        <Things
          environment={environment}
          things={things}
          categories={categories?.categories ?? []}
          filter={filter}
          addable={addable}
          today={today}
        />
      )}
      {state ? (
        <MenuList>
          <MenuRow
            href={environmentAboutHref(environmentId)}
            icon="environment"
            label="Om miljøet"
          />
          {(state === "active" || state === "passive") && (
            <MenuRow
              href={environmentMembershipHref(environmentId)}
              icon="person"
              label="Mitt medlemskap"
            />
          )}
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
