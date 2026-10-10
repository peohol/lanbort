import type {
  AdministeredMembership,
  EnvironmentRole,
  EnvironmentRoles,
  EnvironmentType,
  HomeItem,
  HomeItemKind,
  MembershipPassiveReason,
  PublicationStatus,
} from "@lanbort/contracts";
import {
  classifyTypeChange,
  requirementTransitionDays,
  typeChangeDays,
  windDownCancellationDays,
} from "@lanbort/domain";
import type { Consequences } from "@/components/confirm-action";
import type { Tone } from "@/components/tag";
import { environmentAdminHref } from "@/navigation/routes";
import { environmentRoleNames } from "./environments";
import { homeItemHref } from "./home-items";
import { administrationText } from "./home-tasks";

/**
 * The words of environment administration (WP-85, UX-JRN-012): what each
 * task, state and change means to the administrator, and what it does to
 * others (UX-INT-007). The rules themselves come from the domain, so the
 * words follow them.
 */

/** A type as said of the environment: «miljøet er lukket». */
export const environmentTypeAdjectives: Record<EnvironmentType, string> = {
  open: "åpent",
  closed: "lukket",
  hidden: "skjult",
};

/** The roles as one phrase: «eier og administrator». */
export const describeRoles = (roles: readonly EnvironmentRole[]) =>
  roles
    .map((role) => environmentRoleNames[role].toLocaleLowerCase("nb"))
    .join(" og ");

/** One way the type can change from here (PS-ENV-007–008). */
export interface TypeChoice {
  readonly type: EnvironmentType;
  /** Applies at once, or is proposed to the members. */
  readonly kind: "stricter" | "consent" | "vote";
  readonly consequences: Consequences;
}

const stricterGone: Record<EnvironmentType, readonly string[]> = {
  open: [],
  closed: ["Nye medlemmer kan ikke lenger melde seg inn uten godkjenning."],
  hidden: [
    "Miljøet kan ikke lenger finnes av andre enn medlemmene.",
    "Søknader som venter, avsluttes. Dere kan invitere søkerne i stedet.",
  ],
};

function typeConsequences(
  from: EnvironmentType,
  to: EnvironmentType,
  kind: TypeChoice["kind"],
): Consequences {
  const earlier = `Det som ble delt mens miljøet var ${environmentTypeAdjectives[from]}, vises ikke for nye medlemmer.`;

  switch (kind) {
    case "stricter":
      return {
        gone: stricterGone[to],
        stays: ["Medlemmer, invitasjoner og lån består."],
        affects: [
          "Endringen gjelder med en gang, uten at medlemmene må svare.",
        ],
      };
    case "consent":
      return {
        stays: [earlier, "Miljøet er lukket til fristen går ut."],
        affects: [
          `Hvert medlem får ${typeChangeDays.consent} dager til å godta at miljøet blir åpent.`,
          "Den som ikke godtar, blir passivt medlem og kan godta senere.",
        ],
      };
    case "vote":
      return {
        stays: [
          earlier,
          "Vedtas forslaget ikke, forblir miljøet skjult og ingen fjernes.",
        ],
        affects: [
          `Medlemmene får ${typeChangeDays.vote} dager til å godta den nye synligheten eller forlate miljøet.`,
          "Forslaget vedtas bare hvis minst to tredeler av de aktive medlemmene godtar.",
          "Vedtas det, fjernes de som ikke har godtatt innen fristen.",
        ],
      };
  }
}

/**
 * The types the environment can change to from `current`, and what each
 * change does. Hidden → open is never one step (PS-ENV-008), so it is not
 * offered.
 */
export function typeChoices(current: EnvironmentType): TypeChoice[] {
  return (Object.keys(environmentTypeAdjectives) as EnvironmentType[]).flatMap(
    (type) => {
      if (type === current) return [];

      try {
        const change = classifyTypeChange(current, type);
        const kind = change.kind === "stricter" ? "stricter" : change.process;
        return [
          { type, kind, consequences: typeConsequences(current, type, kind) },
        ];
      } catch {
        return [];
      }
    },
  );
}

/** What a proposed change waits for, in the members' terms. */
export const proposalWaitsFor: Record<"consent" | "vote", string> = {
  consent:
    "Venter på at medlemmene godtar. Den som ikke godtar innen fristen, blir passiv.",
  vote: "Venter på medlemmenes svar. Minst to tredeler av de aktive medlemmene må godta, ellers forblir miljøet skjult.",
};

type Holder = EnvironmentRoles["holders"][number];

/**
 * Who the owner may offer ownership to (PS-ENV-013): another administrator
 * who can act, that is with an active membership, as the domain requires.
 */
export const ownershipRecipients = (
  holders: readonly Holder[],
  ownUserId: string,
) =>
  holders.filter(
    (holder) =>
      holder.userId !== ownUserId &&
      !holder.roles.includes("owner") &&
      holder.canAct,
  );

/** How administrators group the memberships they handle. */
export type MembershipTask =
  "application" | "reactivation" | "confirmation" | "invitation" | "member";

export function membershipTask(
  membership: AdministeredMembership,
): MembershipTask | null {
  if (membership.state === "pending") {
    if (membership.origin === "invitation") return "invitation";
    return membership.reviewStage === "confirmation_required"
      ? "confirmation"
      : "application";
  }

  if (membership.state === "passive" && membership.reviewStage !== null) {
    return "reactivation";
  }

  return membership.state === "active" ? "member" : null;
}

/** What a membership waits for, as a short status. */
export function membershipStatus(membership: AdministeredMembership): {
  text: string;
  tone: Tone;
} {
  if (membership.reviewStage === "information_requested") {
    return { text: "Venter på mer informasjon fra søkeren", tone: "waiting" };
  }

  switch (membershipTask(membership)) {
    case "application":
      return { text: "Søker om å bli med", tone: "waiting" };
    case "reactivation":
      return {
        text: "Passivt medlem som vil bli aktivt igjen",
        tone: "waiting",
      };
    case "confirmation":
      return {
        text: "Må bekrefte at hen fortsatt vil bli med, nå som miljøet er åpent",
        tone: "neutral",
      };
    case "invitation":
      return { text: "Invitert, har ikke svart ennå", tone: "neutral" };
    default:
      return { text: "Medlem", tone: "positive" };
  }
}

/** What the reviewing administrator may do now. */
export const awaitsDecision = (membership: AdministeredMembership) =>
  membership.reviewStage === "submitted" &&
  ["application", "reactivation"].includes(membershipTask(membership) ?? "");

export const publicationStatusLabels: Record<
  Exclude<PublicationStatus, "unpublished">,
  { heading: string; tone: Tone }
> = {
  pending: { heading: "Venter på godkjenning", tone: "waiting" },
  active: { heading: "Synlige for medlemmene", tone: "positive" },
  rejected: { heading: "Avvist", tone: "neutral" },
  blocked: { heading: "Sperret", tone: "danger" },
};

export const objectApprovalConsequences = (required: boolean): Consequences =>
  required
    ? {
        gone: [
          "Ting som er synlige nå, skjules til en administrator har godkjent dem.",
        ],
        stays: ["Avviste og sperrede ting forblir som de er."],
        affects: ["Nye ting må godkjennes før medlemmene ser dem."],
      }
    : {
        stays: ["Avviste og sperrede ting forblir som de er."],
        affects: [
          "Ting som venter på godkjenning, blir synlige for medlemmene med en gang.",
        ],
      };

/** PS-ENV-006: what changed requirements mean for current members. */
export const requirementsChangeNote = `Medlemmer som må svare på et nytt krav, har ${requirementTransitionDays} dager på seg. Den som ikke svarer innen fristen, blir passiv. Et krav du fjerner, gjelder ikke lenger for noen.`;

export const windDownConsequences: Consequences = {
  gone: [
    "Miljøet tar ikke imot nye medlemmer, nye ting eller nye lån.",
    `Når angrefristen på ${windDownCancellationDays} dager er ute, avsluttes publiseringer, søknader og invitasjoner.`,
  ],
  stays: [
    "Lån som allerede er avtalt, fortsetter.",
    "Historikk og saker bevares.",
  ],
  affects: [
    `Alle medlemmene merker det med en gang. Du kan angre i ${windDownCancellationDays} dager.`,
  ],
};

/**
 * The administration's own pages (UX-JRN-012, UX-IA-020): «Administrer
 * miljøet» gathers what waits and leads to each task on a page of its own.
 */
export const administrationPages = {
  memberships: {
    segment: "innmeldinger",
    title: "Innmeldinger og invitasjoner",
  },
  members: { segment: "medlemmer", title: "Medlemmer" },
  things: { segment: "ting", title: "Ting i miljøet" },
  roles: { segment: "roller", title: "Roller og eierskap" },
  settings: { segment: "innstillinger", title: "Innstillinger og krav" },
  type: { segment: "miljotype", title: "Miljøtype" },
} as const;

export type AdministrationPage = keyof typeof administrationPages;

/** «Administrer miljøet», or one of its pages. */
export const administrationPageHref = (
  environmentId: string,
  page?: AdministrationPage,
) =>
  page
    ? `${environmentAdminHref(environmentId)}/${administrationPages[page].segment}`
    : environmentAdminHref(environmentId);

/**
 * Home's tasks for administrators lead to where each is done (UX-JRN-012);
 * a missing owner is answered on «Administrer miljøet» itself.
 */
const administrationTasks: ReadonlyMap<
  HomeItemKind,
  AdministrationPage | undefined
> = new Map([
  ["environment.review_memberships", "memberships"],
  ["environment.review_publications", "things"],
  ["environment.claim_ownership", undefined],
]);

export const administrationHref = (item: HomeItem): string | null =>
  administrationTasks.has(item.kind)
    ? administrationPageHref(item.target.id, administrationTasks.get(item.kind))
    : null;

/** A task waiting on the administrators, as a row in «Venter på dere». */
export interface WaitingTask {
  readonly kind: HomeItemKind;
  readonly href: string;
  readonly label: string;
  readonly count: number;
}

const waitingLabels: Partial<Record<HomeItemKind, string>> = {
  "environment.review_memberships": "Innmeldinger",
  "environment.review_publications": "Ting til godkjenning",
};

/**
 * «Venter på dere» (UX-JRN-012): every counted task, each leading where it
 * is done. Memberships and things have pages here; any other task, such as
 * each kind of case, says what to do and leads where Home sends it, so no
 * kind is ever left out. A missing owner is the page's status card.
 */
export const waitingTasks = (tasks: readonly HomeItem[]): WaitingTask[] =>
  tasks
    .filter((item) => item.kind !== "environment.claim_ownership")
    .map((item) => ({
      kind: item.kind,
      href:
        administrationHref(item) ??
        homeItemHref(item) ??
        administrationPageHref(item.target.id),
      label: waitingLabels[item.kind] ?? administrationText(item),
      count: item.count ?? 1,
    }));

/** «3 aktive», «1 aktiv». */
export const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const names = new Intl.ListFormat("nb", { type: "conjunction" });

/**
 * Who or what waits, in a short line: «Jonas Vik og Erik Sund», and past
 * `shown`, «Jonas Vik, Erik Sund og 3 til». `total` counts also those not
 * listed.
 */
export function waitingNames(
  listed: readonly string[],
  total = listed.length,
  shown = 2,
): string | null {
  if (listed.length === 0) return null;
  const first = listed.slice(0, shown);
  const rest = total - first.length;

  return rest > 0
    ? names.format([...first, `${rest} til`])
    : names.format(first);
}

/** Why a member is passive (PS-ENV-006, PS-ENV-008), as administrators see it. */
export const passiveReasonTexts: Record<MembershipPassiveReason, string> = {
  requirements_not_met: "Svarte ikke på et nytt krav innen fristen",
  type_change_not_accepted: "Godtok ikke at miljøet ble åpent",
};
