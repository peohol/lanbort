import type {
  Environment,
  EnvironmentMemberships,
  EnvironmentRoles,
  HomeItem,
} from "@lanbort/contracts";
import {
  listEnvironmentAdministrationTasks,
  listEnvironmentPublications,
  listMemberships,
  listRoles,
} from "@lanbort/domain";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import type { IconName } from "@/components/icon";
import { MenuList, MenuRow } from "@/components/menu-list";
import { MoreActions } from "@/components/more-actions";
import { PageHeader } from "@/components/page-header";
import { ReauthenticatedAction } from "@/components/reauthenticated-action";
import { StatusCard } from "@/components/status-card";
import { ContextTag, Tag } from "@/components/tag";
import { environmentCasesHref } from "@/navigation/cases";
import { environmentHref } from "@/navigation/routes";
import { formatTime } from "@/presentation/dates";
import { environmentTypeNames } from "@/presentation/environments";
import {
  type AdministrationPage,
  administrationPageHref,
  administrationPages,
  awaitsDecision,
  counted,
  waitingNames,
  windDownConsequences,
} from "@/presentation/environment-admin";
import { pageQuery, pageQueryOrNotFound } from "@/server/session";
import { environmentHome } from "../back";
import {
  type AdministrationParams,
  loadAdministration,
  RoleTag,
} from "./administration";
import { memberName } from "./memberships";

export const metadata: Metadata = { title: "Administrer miljøet – Lånbort" };

/**
 * «Administrer miljøet» (WP-85, UX-JRN-012, UX-PRIV-006): what waits on
 * the administrators first, each task leading to its own page, then the
 * environment's pages, and the rare steps under «Flere valg». The counts
 * are Home's (UX-IA-005), read the same way.
 */
export default async function EnvironmentAdministrationPage({
  params,
}: {
  params: AdministrationParams;
}) {
  const { account, environment } = await loadAdministration(params);

  if (environment.membership?.state !== "active") {
    return <PassiveAdministrator environment={environment} />;
  }

  const environmentId = environment.id;
  const [tasks, memberships, roles, pending] = await Promise.all([
    pageQuery(listEnvironmentAdministrationTasks, { environmentId }),
    pageQueryOrNotFound(listMemberships, { environmentId }),
    pageQueryOrNotFound(listRoles, { environmentId }),
    pageQueryOrNotFound(listEnvironmentPublications, {
      environmentId,
      status: "pending",
    }),
  ]);
  const count = (kind: HomeItem["kind"]) =>
    tasks?.find((task) => task.kind === kind)?.count ?? 0;
  const decisions =
    count("environment.review_memberships") +
    count("environment.review_publications");
  const cases = count("environment.handle_cases");
  const waiting = (
    [
      {
        href: administrationPageHref(environmentId, "memberships"),
        label: "Innmeldinger",
        icon: "person",
        count: count("environment.review_memberships"),
        detail: waitingNames(
          memberships.memberships
            .filter((m) => awaitsDecision(m) && m.userId !== account.userId)
            .map(memberName),
        ),
      },
      {
        href: administrationPageHref(environmentId, "things"),
        label: "Ting til godkjenning",
        icon: "things",
        count: count("environment.review_publications"),
        detail: waitingNames(
          pending.publications
            .filter((publication) => !publication.ownedByYou)
            .map((publication) => publication.object.title),
          count("environment.review_publications"),
        ),
      },
      {
        href: environmentCasesHref(environmentId),
        label: "Saker",
        icon: "flag",
        count: cases,
        detail: null,
      },
    ] satisfies WaitingRow[]
  ).filter((row) => row.count > 0);

  return (
    <main>
      <PageHeader
        title="Administrer miljøet"
        back={{ href: environmentHref(environmentId), label: environment.name }}
        home={environmentHome(environment)}
        context={
          <>
            <ContextTag label="Miljøtype">
              {environmentTypeNames[environment.type]}
            </ContextTag>
            <RoleTag environment={environment} />
          </>
        }
      />
      <Overview environment={environment} decisions={decisions} />
      {waiting.length > 0 && (
        <section aria-labelledby="venter">
          <h2 id="venter">Venter på dere</h2>
          <MenuList label="venter">
            {waiting.map((row) => (
              <MenuRow
                key={row.label}
                href={row.href}
                icon={row.icon}
                label={row.label}
                detail={row.detail}
                end={<Tag tone="attention">{row.count} venter</Tag>}
              />
            ))}
          </MenuList>
        </section>
      )}
      <section aria-labelledby="miljoet">
        <h2 id="miljoet">Miljøet</h2>
        <MenuList label="miljoet">
          {environmentRows(environment, memberships, roles)
            // Waiting memberships are reached from «Venter på dere».
            .filter(
              (row) =>
                row.page !== "memberships" ||
                count("environment.review_memberships") === 0,
            )
            .map((row) => (
              <MenuRow
                key={row.page}
                href={administrationPageHref(environmentId, row.page)}
                icon={row.icon}
                label={administrationPages[row.page].title}
                detail={row.detail}
              />
            ))}
          {cases === 0 && (
            <MenuRow
              href={environmentCasesHref(environmentId)}
              icon="flag"
              label="Saker"
              detail="Ingen venter"
            />
          )}
        </MenuList>
      </section>
      {environment.roles.includes("owner") &&
        environment.state === "active" && (
          <MoreActions>
            <ReauthenticatedAction
              label="Avvikle miljøet"
              title={`Avvikle ${environment.name}`}
              consequences={windDownConsequences}
              confirmLabel={`Avvikle ${environment.name}`}
              path="/api/environments/wind-down"
              body={{ environmentId }}
              danger
            />
          </MoreActions>
        )}
    </main>
  );
}

interface WaitingRow {
  href: string;
  label: string;
  icon: IconName;
  count: number;
  detail: string | null;
}

/** The environment's own pages, each with a line on how it stands now. */
function environmentRows(
  environment: Environment,
  { memberships, restrictions }: EnvironmentMemberships,
  { holders }: EnvironmentRoles,
): { page: AdministrationPage; icon: IconName; detail?: string }[] {
  const active = memberships.filter((m) => m.state === "active").length;
  const passive = memberships.filter((m) => m.state === "passive").length;
  const owner = holders.find((holder) => holder.roles.includes("owner"));
  const proposal = environment.typeChange;

  return [
    {
      page: "members",
      icon: "people",
      detail: [
        counted(active, "aktivt", "aktive"),
        passive > 0 && counted(passive, "passivt", "passive"),
        restrictions.length > 0 && `${restrictions.length} stengt ute`,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    { page: "memberships", icon: "person" },
    {
      page: "things",
      icon: "things",
      detail: environment.requiresObjectApproval
        ? "Nye ting må godkjennes"
        : "Nye ting vises med en gang",
    },
    {
      page: "roles",
      icon: "shield",
      detail: [
        owner ? `${memberName(owner)} er eier` : "Miljøet mangler eier",
        counted(holders.length, "administrator", "administratorer"),
      ].join(" · "),
    },
    {
      page: "settings",
      icon: "edit",
      detail:
        environment.requirements.length === 0
          ? "Navn, beskrivelse og område. Ingen krav for å bli med"
          : `Navn, beskrivelse, område og ${counted(environment.requirements.length, "krav", "krav")}`,
    },
    {
      page: "type",
      icon: "lock",
      detail: proposal
        ? `Forslag om ${environmentTypeNames[proposal.toType].toLocaleLowerCase("nb")} venter på medlemmene`
        : environmentTypeNames[environment.type],
    },
  ];
}

/**
 * What needs the administrators now: an environment winding down or
 * without an owner first (PS-ENV-012–013), otherwise how many decisions
 * wait.
 */
function Overview({
  environment,
  decisions,
}: {
  environment: Environment;
  decisions: number;
}) {
  const continuity = environment.continuity;
  const body = { environmentId: environment.id };
  const isOwner = environment.roles.includes("owner");

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
      who={
        decisions === 0
          ? undefined
          : "Alle administratorene ser de samme oppgavene. Den som avgjør først, avgjør for miljøet."
      }
    />
  );
}

/**
 * An administrator who is not an active member cannot administer
 * (PS-ENV-003) until they are active again, but may still give up the role
 * when the domain allows it: not the owner, and not the last administrator.
 * Without an active administrator, waiting decisions wait (UX-EXC-009).
 */
function PassiveAdministrator({ environment }: { environment: Environment }) {
  const isOwner = environment.roles.includes("owner");
  const mayResign = environment.continuity?.mayResign ?? false;

  return (
    <main>
      <PageHeader
        title="Administrer miljøet"
        back={{
          href: environmentHref(environment.id),
          label: environment.name,
        }}
        home={environmentHome(environment)}
      />
      <StatusCard
        status="Du kan ikke administrere miljøet nå"
        tone="warning"
        who="Rollen gjelder bare mens du er aktivt medlem. Bli aktivt medlem igjen fra miljøets side."
        actions={
          mayResign ? (
            <ActionButton
              label="Gå av som administrator"
              path="/api/environments/roles/resign"
              body={{ environmentId: environment.id }}
            />
          ) : undefined
        }
      >
        {!isOwner && !mayResign && (
          <p>
            Du er den eneste administratoren, så du kan ikke gå av før noen
            andre er administrator.
          </p>
        )}
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
