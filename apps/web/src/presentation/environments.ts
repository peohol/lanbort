import type {
  ApproximateMembers,
  Environment,
  EnvironmentRole,
  EnvironmentType,
  RequirementKind,
  TypeChangeProposal,
} from "@lanbort/contracts";
import { formatTime } from "./dates";

/** The three types by name (PS-ENV-001). */
export const environmentTypeNames: Record<EnvironmentType, string> = {
  open: "Åpent miljø",
  closed: "Lukket miljø",
  hidden: "Skjult miljø",
};

/** What each type means for the user, before joining (UX-JRN-002). */
export const environmentTypeExplanations: Record<EnvironmentType, string> = {
  open: "Alle kan finne miljøet og bli med selv.",
  closed:
    "Alle kan finne miljøet, men en administrator godkjenner nye medlemmer.",
  hidden:
    "Bare medlemmene vet at miljøet finnes. Man blir med når en administrator inviterer en.",
};

const memberCountFormat = new Intl.NumberFormat("nb-NO");

/**
 * PS-ENV-016: about how many members, as the server rounded it, such as
 * «under 10 medlemmer» or «ca. 140 medlemmer».
 */
export const describeMembers = ({ kind, count }: ApproximateMembers) =>
  `${kind === "fewer_than" ? "under" : "ca."} ${memberCountFormat.format(count)} medlemmer`;

export const environmentRoleNames: Record<EnvironmentRole, string> = {
  owner: "Eier",
  administrator: "Administrator",
};

/** A role as one tag: the owner is also administrator (PS-ENV-003). */
export const roleName = (roles: readonly EnvironmentRole[]) =>
  roles.includes("owner")
    ? environmentRoleNames.owner
    : roles.includes("administrator")
      ? environmentRoleNames.administrator
      : null;

/** What the member does with a requirement (PS-ENV-005). */
export const requirementKindNames: Record<RequirementKind, string> = {
  information: "Du svarer på",
  acceptance: "Du godtar",
};

/**
 * Where the user stands with the environment, and the step the page leads
 * to (UX-INT-001). One place decides, so the status card and the actions
 * never disagree.
 */
export type MembershipStep =
  /** Nobody takes new members while it winds down (PS-ENV-012). */
  | { readonly kind: "closed_to_new" }
  | { readonly kind: "join" }
  /** After a rejected application, applying again is the same step. */
  | { readonly kind: "apply"; readonly rejected: boolean }
  /**
   * Barred from new attempts (PS-ENV-020): no way to apply, or to become
   * active again, until the administrators lift it.
   */
  | { readonly kind: "barred"; readonly passive: boolean }
  | { readonly kind: "accept_invitation" }
  | { readonly kind: "awaiting_review"; readonly reactivation: boolean }
  | { readonly kind: "information_requested" }
  /** After closed → open, the applicant confirms the wish to join. */
  | { readonly kind: "confirm" }
  | { readonly kind: "passive"; readonly direct: boolean }
  | { readonly kind: "transition"; readonly deadline: string }
  | { readonly kind: "member" };

export function membershipStep(environment: Environment): MembershipStep {
  const { membership } = environment;
  const takesMembers = environment.state === "active";

  if (!membership) {
    if (!takesMembers) return { kind: "closed_to_new" };
    if (environment.restricted) return { kind: "barred", passive: false };
    return environment.type === "open"
      ? { kind: "join" }
      : { kind: "apply", rejected: environment.applicationRejected };
  }

  if (membership.reviewStage === "information_requested") {
    return { kind: "information_requested" };
  }

  if (membership.state === "pending") {
    if (membership.origin === "invitation") {
      return takesMembers
        ? { kind: "accept_invitation" }
        : { kind: "closed_to_new" };
    }

    return membership.reviewStage === "confirmation_required"
      ? { kind: "confirm" }
      : { kind: "awaiting_review", reactivation: false };
  }

  if (membership.state === "passive") {
    if (membership.reviewStage !== null) {
      return { kind: "awaiting_review", reactivation: true };
    }

    if (environment.restricted) return { kind: "barred", passive: true };

    // A member who did not accept a weaker type, and every member of an open
    // environment, becomes active again directly (PS-ENV-008).
    return {
      kind: "passive",
      direct:
        environment.type === "open" ||
        membership.passiveReason === "type_change_not_accepted",
    };
  }

  if (
    membership.transitionDeadline !== null &&
    membership.unmetRequirementIds.length > 0
  ) {
    return { kind: "transition", deadline: membership.transitionDeadline };
  }

  return { kind: "member" };
}

/** The status in words, said as a situation (UX-INT-004). */
export function describeMembership(
  environment: Environment,
  step: MembershipStep,
): string {
  switch (step.kind) {
    case "closed_to_new":
      return "Miljøet avvikles og tar ikke inn nye medlemmer.";
    case "join":
      return "Du er ikke medlem. Du kan bli med med en gang.";
    case "apply":
      // PS-ENV-017: neutral, never why or who decided.
      return step.rejected
        ? "Søknaden ble ikke godkjent."
        : "Du er ikke medlem. En administrator ser på søknaden din før du blir med.";
    case "barred":
      // PS-ENV-020: as neutral as the rejection, never why or who decided.
      return step.passive
        ? "Du er passivt medlem. Du kan ikke søke om å bli med nå."
        : "Du kan ikke søke om å bli med nå.";
    case "accept_invitation":
      return "Du er invitert til miljøet. Les reglene og godta invitasjonen for å bli med.";
    case "awaiting_review":
      // PS-ENV-017: the outcome comes as a notification either way.
      return step.reactivation
        ? "Du har bedt om å bli aktiv igjen. Venter på svar fra administratorene. Du får varsel når de har svart."
        : "Søknaden din venter på svar fra administratorene. Du får varsel når de har svart.";
    case "information_requested":
      // PS-ENV-019: their question, when they wrote one, is shown with it.
      return environment.membership?.informationQuestion
        ? "Administratorene ber om mer informasjon før de svarer."
        : "Administratorene ber om mer informasjon før de svarer. Se over svarene dine og send dem på nytt.";
    case "confirm":
      return "Miljøet er blitt åpent. Bekreft at du fortsatt vil bli med.";
    case "passive":
      return environment.membership?.passiveReason ===
        "type_change_not_accepted"
        ? "Du er passivt medlem fordi du ikke godtok at miljøet ble åpent. Du ser ikke tingene og medlemmene før du blir aktiv igjen."
        : "Du er passivt medlem fordi nye krav ikke ble oppfylt innen fristen. Du ser ikke tingene og medlemmene før du blir aktiv igjen.";
    case "transition":
      return "Miljøet har fått nye krav. Svar på dem for å fortsatt være aktivt medlem.";
    case "member":
      return "Du er medlem.";
  }
}

/** The membership in a word or two, above its status (Tomat kjerneflyt 3). */
export function membershipLabel(
  environment: Environment,
  step: MembershipStep,
): string {
  switch (step.kind) {
    case "closed_to_new":
      return "Avvikles";
    case "apply":
      return step.rejected
        ? "Ikke godkjent"
        : environmentTypeNames[environment.type];
    case "join":
      return environmentTypeNames[environment.type];
    case "barred":
      if (step.passive) return "Passivt medlem";
      return environment.applicationRejected
        ? "Ikke godkjent"
        : environmentTypeNames[environment.type];
    case "accept_invitation":
      return "Invitert";
    case "awaiting_review":
      return "Venter på administratorene";
    case "information_requested":
    case "confirm":
      return "Venter på deg";
    case "passive":
      return "Passivt medlem";
    case "transition":
      return "Nye krav";
    case "member":
      return "Medlem";
  }
}

/**
 * The command for a step that sends answers (PS-ENV-005): its page's
 * heading, the way to that page from the status card, the button that sends
 * it, whether the user is a member as soon as it is sent, to be welcomed
 * on arrival (Tomat kjerneflyt 3), and whether the administrators decide.
 */
export interface AnswerCommand {
  readonly path: string;
  readonly heading: string;
  readonly opens: string;
  readonly label: string;
  readonly joins: boolean;
  readonly reviewed: boolean;
}

export function answerCommand(
  environment: Environment,
  step: MembershipStep,
): AnswerCommand | null {
  const join = "/api/environments/membership/join";
  const answers = "/api/environments/membership/answers";

  switch (step.kind) {
    case "join":
      return {
        path: join,
        heading: "Bli med",
        opens: "Bli med",
        label: "Bli med",
        joins: true,
        reviewed: false,
      };
    case "apply":
      return {
        path: join,
        heading: "Søk om å bli med",
        opens: step.rejected ? "Søk på nytt" : "Søk om å bli med",
        label: "Send søknaden",
        joins: false,
        reviewed: true,
      };
    case "confirm":
      return {
        path: join,
        heading: "Bli med",
        opens: "Bli med",
        label: "Bekreft at du vil bli med",
        joins: true,
        reviewed: false,
      };
    case "passive":
      return {
        path: join,
        heading: "Bli aktiv igjen",
        opens: "Bli aktiv igjen",
        label: step.direct ? "Bli aktiv igjen" : "Be om å bli aktiv igjen",
        joins: false,
        reviewed: !step.direct,
      };
    case "accept_invitation":
      return {
        path: "/api/environments/membership/accept",
        heading: "Bli med",
        opens: "Bli med",
        label: `Godta invitasjonen til ${environment.name}`,
        joins: true,
        reviewed: false,
      };
    case "information_requested":
      return {
        path: answers,
        heading: "Svarene dine",
        opens: "Se over svarene",
        label: "Send svarene",
        joins: false,
        reviewed: true,
      };
    case "transition":
      return {
        path: answers,
        heading: "Nye krav",
        opens: "Se de nye kravene",
        label: "Send svarene",
        joins: false,
        reviewed: false,
      };
    default:
      return null;
  }
}

/**
 * What the user has given to a pending membership, as it was sent (Tomat
 * kjerneflyt 3): each answer under its question, an answer to a question
 * the administrators have changed since, and the rules once all of them
 * are accepted. Only the user's own answers, on their own page
 * (UX-PRIV-009).
 */
export function givenAnswers(
  environment: Environment,
): { term: string; value: string }[] {
  const current = new Map(
    environment.requirements.map((requirement, index) => [
      requirement.id,
      { ...requirement, index },
    ]),
  );
  const order = (id: string) => current.get(id)?.index ?? Infinity;
  const answers = [...(environment.membership?.answers ?? [])].sort(
    (a, b) => order(a.requirementId) - order(b.requirementId),
  );
  const accepted = new Set(
    answers.filter((a) => a.answer === null).map((a) => a.requirementId),
  );
  const rules = environment.requirements.filter(
    ({ kind }) => kind === "acceptance",
  );

  return [
    ...answers.flatMap(({ requirementId, answer }) =>
      answer === null
        ? []
        : [
            {
              term:
                current.get(requirementId)?.text ?? "Et spørsmål som er endret",
              value: answer,
            },
          ],
    ),
    ...(rules.length > 0 && rules.every(({ id }) => accepted.has(id))
      ? [{ term: "Regler", value: "Godtatt" }]
      : []),
  ];
}

/** The greeting on the first visit as a member (Tomat kjerneflyt 3). */
export const welcome = (realName: string | null) => {
  const first = realName?.trim().split(/\s+/)[0];

  return first ? `Velkommen, ${first}` : "Velkommen";
};

/** What a member who leaves loses and keeps (UX-INT-007). */
export function leavingConsequences(environment: Environment) {
  const rejoin: Record<EnvironmentType, string> = {
    open: "Du kan bli med igjen når du vil.",
    closed: "For å bli med igjen må du søke på nytt.",
    hidden: "For å bli med igjen trenger du en ny invitasjon.",
  };

  return {
    gone: [
      "Du ser ikke lenger tingene og medlemmene i miljøet.",
      "Tingene dine vises ikke lenger for medlemmene her.",
    ],
    stays: [
      "Lån som allerede er avtalt, fortsetter som før.",
      rejoin[environment.type],
    ],
  };
}

/**
 * What a weaker type means for the member (UX-PRIV-008, PS-ENV-008):
 * what becomes more visible, what does not, how the change is decided,
 * and what happens to someone who has not accepted by the deadline.
 */
export function describeTypeChange(proposal: TypeChangeProposal) {
  const deadline = formatTime(proposal.deadline);
  const unchanged =
    "Det du allerede har gjort i miljøet, blir ikke mer synlig enn før.";

  if (proposal.toType === "open") {
    return {
      heading: "Administratorene foreslår å gjøre miljøet åpent",
      lines: [
        "Da kan alle finne miljøet og bli med selv, uten at en administrator godkjenner dem.",
        unchanged,
        `Svar innen ${deadline}. Godtar du ikke innen fristen, blir du passivt medlem og ser ikke tingene og medlemmene før du blir aktiv igjen.`,
      ],
      accept: "Godta at miljøet blir åpent",
    };
  }

  return {
    heading: "Administratorene foreslår å gjøre miljøet lukket",
    lines: [
      "Da kan alle finne miljøet og se navnet og beskrivelsen, og søke om å bli med.",
      unchanged,
      `Endringen vedtas hvis minst 2 av 3 aktive medlemmer godtar den innen ${deadline}.`,
      "Vedtas den, blir de som ikke har godtatt, fjernet fra miljøet når fristen går ut. Vedtas den ikke, forblir miljøet skjult og ingen fjernes.",
    ],
    accept: "Godta at miljøet blir lukket",
  };
}

/** The member's own answer so far, in words. */
export const typeChangeAnswer = (proposal: TypeChangeProposal) =>
  proposal.yourResponse === null
    ? "Du har ikke svart ennå."
    : proposal.yourResponse
      ? "Du har godtatt endringen."
      : "Du har sagt nei til endringen.";
