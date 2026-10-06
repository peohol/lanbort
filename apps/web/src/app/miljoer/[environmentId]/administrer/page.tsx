import type { Environment } from "@lanbort/contracts";
import {
  getEnvironment,
  getSocialOverview,
  listEnvironmentPublications,
  listMemberships,
  listObjectCategories,
  listRoles,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag, Tag } from "@/components/tag";
import { environmentHref } from "@/navigation/routes";
import { formatTime } from "@/presentation/dates";
import { environmentTypeNames } from "@/presentation/environments";
import {
  awaitsDecision,
  describeRoles,
} from "@/presentation/environment-admin";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { MembershipsSection } from "./memberships-section";
import {
  olderParam,
  PublicationsSection,
  reviewedStatuses,
} from "./publications-section";
import { RolesSection } from "./roles-section";
import { SettingsSection } from "./settings-section";
import { TypeSection, WindDownSection } from "./type-section";

export const metadata: Metadata = { title: "Administrer miljøet – Lånbort" };

type SearchParams = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/**
 * An environment's administration (WP-85, UX-JRN-012, UX-PRIV-006): the
 * administrators' tasks on the environment itself, decisions first, then
 * the rarer settings. Only the environment's roles reach it; to anyone
 * else it does not exist, like any page they may not see (PS-NFR-002).
 * Every action is authorized again by the API.
 */
export default async function EnvironmentAdministrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ environmentId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const account = await requirePageAccount();
  const [{ environmentId }, query] = await Promise.all([params, searchParams]);
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });

  if (environment.roles.length === 0) {
    notFound();
  }

  if (environment.membership?.state !== "active") {
    return <PassiveAdministrator environment={environment} />;
  }

  const [memberships, roles, social, categories, ...publications] =
    await Promise.all([
      pageQueryOrNotFound(listMemberships, { environmentId }),
      pageQueryOrNotFound(listRoles, { environmentId }),
      environment.type === "open" ? null : pageQuery(getSocialOverview, {}),
      pageQuery(listObjectCategories, {}),
      ...reviewedStatuses.map((status) =>
        pageQueryOrNotFound(listEnvironmentPublications, {
          environmentId,
          status,
          cursor: single(query[olderParam(status)]),
        }),
      ),
    ]);
  const isOwner = environment.roles.includes("owner");
  const pending = publications[reviewedStatuses.indexOf("pending")];
  const decisions =
    memberships.memberships.filter(awaitsDecision).length +
    (pending?.publications.filter((p) => !p.ownedByYou).length ?? 0);

  return (
    <main>
      <PageHeader
        title={environment.name}
        back={{ href: environmentHref(environment.id), label: "Til miljøet" }}
        context={
          <>
            <ContextTag label="Miljøtype">
              {environmentTypeNames[environment.type]}
            </ContextTag>
            <Tag>Du er {describeRoles(environment.roles)}</Tag>
          </>
        }
      >
        Oppgaver og innstillinger for miljøet.
      </PageHeader>
      <Overview
        environment={environment}
        isOwner={isOwner}
        decisions={decisions}
      />
      <nav aria-label="På denne siden" className="link-row">
        <a href="#innmeldinger">Innmeldinger</a> <a href="#ting">Ting</a>{" "}
        <a href="#roller">Roller</a> <a href="#innstillinger">Innstillinger</a>{" "}
        <a href="#miljotype">Miljøtype</a>
      </nav>
      <MembershipsSection
        environment={environment}
        memberships={memberships}
        friends={social?.friends ?? []}
        ownUserId={account.userId}
      />
      <PublicationsSection
        environment={environment}
        pages={publications}
        members={memberships.memberships}
        categories={categories?.categories ?? []}
        query={query}
      />
      <RolesSection
        environment={environment}
        roles={roles}
        members={memberships.memberships}
        ownUserId={account.userId}
      />
      <SettingsSection environment={environment} />
      <TypeSection environment={environment} />
      {isOwner && <WindDownSection environment={environment} />}
    </main>
  );
}

/**
 * What needs the administrators now: an environment winding down or
 * without an owner first (PS-ENV-012–013), otherwise how many decisions
 * wait.
 */
function Overview({
  environment,
  isOwner,
  decisions,
}: {
  environment: Environment;
  isOwner: boolean;
  decisions: number;
}) {
  const continuity = environment.continuity;
  const body = { environmentId: environment.id };

  if (continuity?.windDown) {
    const { windDown } = continuity;

    return (
      <StatusCard
        status={
          windDown.reason === "ownerless"
            ? "Miljøet avvikles fordi ingen overtok eierskapet"
            : "Miljøet avvikles"
        }
        tone="warning"
        when={
          windDown.cancellable
            ? `Eieren kan angre til ${formatTime(windDown.finalAt)}`
            : `Endelig fra ${formatTime(windDown.finalAt)}`
        }
        actions={
          isOwner && windDown.cancellable ? (
            <ActionButton
              label="Fortsett miljøet"
              path="/api/environments/wind-down/cancel"
              body={body}
              primary
            />
          ) : undefined
        }
      >
        <p>
          Miljøet tar ikke imot nye medlemmer, nye ting eller nye lån. Lån som
          allerede er avtalt, fortsetter.
        </p>
      </StatusCard>
    );
  }

  if (continuity?.ownershipVacancy) {
    const vacancy = continuity.ownershipVacancy;

    return (
      <StatusCard
        status="Miljøet mangler eier"
        tone="warning"
        when={`Meld interesse innen ${formatTime(vacancy.claimDeadline)}`}
        who={
          vacancy.claimedByYou
            ? "Du har meldt at du vil overta. Den som har vært administrator lengst, blir eier."
            : "Administratorene kan melde at de vil overta. Den som har vært administrator lengst, blir eier. Overtar ingen, avvikles miljøet."
        }
        actions={
          vacancy.claimedByYou ? (
            <ActionButton
              label="Trekk interessen"
              path="/api/environments/ownership/withdraw-claim"
              body={body}
            />
          ) : (
            <ActionButton
              label="Jeg vil overta eierskapet"
              path="/api/environments/ownership/claim"
              body={body}
              primary
            />
          )
        }
      />
    );
  }

  return (
    <StatusCard
      status={
        decisions === 0
          ? "Ingen avgjørelser venter på deg"
          : `${decisions} ${decisions === 1 ? "avgjørelse venter" : "avgjørelser venter"} på administratorene`
      }
      tone={decisions === 0 ? "positive" : "waiting"}
    />
  );
}

/**
 * An administrator who is not an active member cannot administer
 * (PS-ENV-003) until they are active again, but may still give up the role.
 * Without an active administrator, waiting decisions wait (UX-EXC-009).
 */
function PassiveAdministrator({ environment }: { environment: Environment }) {
  const isOwner = environment.roles.includes("owner");

  return (
    <main>
      <PageHeader
        title={environment.name}
        back={{ href: environmentHref(environment.id), label: "Til miljøet" }}
      />
      <StatusCard
        status="Du kan ikke administrere miljøet nå"
        tone="warning"
        who="Rollen gjelder bare mens du er aktivt medlem. Bli aktivt medlem igjen fra miljøets side."
        actions={
          isOwner ? undefined : (
            <ActionButton
              label="Gå av som administrator"
              path="/api/environments/roles/resign"
              body={{ environmentId: environment.id }}
            />
          )
        }
      >
        {environment.continuity?.administrationAvailable === false && (
          <p>
            Ingen administrator er aktiv nå, så innmeldinger og andre
            avgjørelser venter til en blir det.
          </p>
        )}
      </StatusCard>
    </main>
  );
}
