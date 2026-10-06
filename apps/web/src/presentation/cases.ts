import type {
  Case,
  CaseAudience,
  CaseKind,
  CaseParticipantRole,
  CaseQueueReturnReason,
  CaseSummary,
  ModerationMeasureKind,
  ReportTargetKind,
} from "@lanbort/contracts";
import { caseKinds } from "@lanbort/domain";
import type { Tone } from "@/components/tag";

/** What kind of case it is, in the user's words. */
export const caseKindLabels: Record<CaseKind, string> = {
  environment_contact: "Kontakt med administratorene",
  loan_mediation: "Mekling om et lån",
  unavailability_report: "Melding om at noen kan være utilgjengelig",
  environment_report: "Rapport til miljøet",
  platform_report: "Rapport til Lånbort",
};

/**
 * Who handles a kind: a function, never a person (PS-COM-010), on its own
 * and in a sentence.
 */
export const handlerFunction = (kind: CaseKind) =>
  caseKinds[kind].platform ? "Lånbort" : "Miljøets administratorer";

const handlersInSentence = (kind: CaseKind) =>
  caseKinds[kind].platform ? "Lånbort" : "miljøets administratorer";

export const participantRoleLabels: Record<CaseParticipantRole, string> = {
  requester: "Tok kontakt",
  borrower: "Låntaker",
  lender: "Utlåner",
  reporter: "Meldte saken",
};

export const reportTargetLabels: Record<ReportTargetKind, string> = {
  user: "en person",
  object: "en ting",
  review: "en anmeldelse",
  review_response: "et tilsvar på en anmeldelse",
};

/**
 * A person the case names; a deleted account has no name (UX-PRIV-010).
 * `unnamed` is for someone the case does not name to the viewer.
 */
export function personIn(
  people: Case["people"],
  userId: string | null,
  unnamed = "Tidligere bruker",
): string {
  const person = people.find((each) => each.userId === userId);

  return person ? (person.realName ?? "Tidligere bruker") : unnamed;
}

/** The case's title: what it is about, as far as the viewer knows. */
export function caseTitle(c: Case): string {
  const about = c.loanTitle ?? c.objectTitle;

  if (c.kind === "loan_mediation") {
    return about ? `Mekling om ${about}` : caseKindLabels[c.kind];
  }

  if (c.reportTarget === "user" || c.kind === "unavailability_report") {
    return `${caseKindLabels[c.kind]} om ${personIn(c.people, c.subjectUserId)}`;
  }

  if (c.reportTarget === "object" && about) {
    return `${caseKindLabels[c.kind]} om ${about}`;
  }

  return c.reportTarget
    ? `${caseKindLabels[c.kind]} om ${reportTargetLabels[c.reportTarget]}`
    : caseKindLabels[c.kind];
}

export interface HandlingStatus {
  readonly text: string;
  readonly tone: Tone;
  /** What it means, where there is room to say it. */
  readonly detail?: string;
}

type Handling = Pick<
  CaseSummary,
  "status" | "handling" | "assigneeUserId" | "kind"
>;

/**
 * How the handling stands (UX-EXC-009). A participant learns only whether
 * it is taken, waiting, or that nobody can handle it now; a handler also
 * who has it.
 */
export function describeHandling(
  c: Handling,
  viewer: { readonly userId: string; readonly asHandler: boolean },
  nameOf: (userId: string) => string,
): HandlingStatus {
  if (c.status === "closed") {
    return { text: "Saken er lukket", tone: "neutral" };
  }

  if (c.handling === "unavailable") {
    return {
      text: "Ingen kan behandle saken nå",
      detail:
        "Det finnes ingen som kan ta saken nå. Den blir liggende til noen kan det.",
      tone: "warning",
    };
  }

  if (c.handling === "queued") {
    return {
      text: viewer.asHandler
        ? "Ingen har tatt saken ennå"
        : `Venter på at ${handlersInSentence(c.kind)} tar saken`,
      tone: "waiting",
    };
  }

  if (!viewer.asHandler || c.assigneeUserId === null) {
    return { text: "En saksbehandler har saken", tone: "positive" };
  }

  return {
    text:
      c.assigneeUserId === viewer.userId
        ? "Du har saken"
        : `${nameOf(c.assigneeUserId)} har saken`,
    tone: "positive",
  };
}

/** What a participant may do now, said plainly (PS-COM-012). */
export function participantTurn(c: Case): string | null {
  if (c.status === "closed") {
    return null;
  }

  if (c.mayWrite) {
    return c.kind === "environment_contact"
      ? null
      : "Du kan skrive et innlegg nå. Etter det venter du til saksbehandleren ber om mer.";
  }

  return "Du har skrevet innlegget ditt. Du kan skrive igjen når saksbehandleren ber om mer.";
}

/** Who sees an entry, for its handlers. */
export function audienceLabel(
  entry: Pick<Case["entries"][number], "audience" | "toUserId" | "shared">,
  people: Case["people"],
  kind: CaseKind,
): string {
  const labels: Record<CaseAudience, string> = {
    handlers: "Internt notat, bare for saksbehandlerne",
    party: `Bare til ${personIn(people, entry.toUserId)}`,
    parties:
      kind === "loan_mediation" && !entry.shared
        ? "Ikke delt med den andre parten ennå"
        : "Alle parter ser dette",
  };

  return labels[entry.audience];
}

/** Who wrote an entry, as the viewer may know it. */
export function entryAuthor(
  entry: Pick<Case["entries"][number], "capacity" | "authorUserId">,
  c: Case,
  userId: string,
): string {
  if (entry.capacity === "handler") {
    return entry.authorUserId === null
      ? handlerFunction(c.kind)
      : `${personIn(c.people, entry.authorUserId)} (saksbehandler)`;
  }

  return entry.authorUserId === userId
    ? "Deg"
    : personIn(c.people, entry.authorUserId);
}

const returnReasons: Record<CaseQueueReturnReason, string> = {
  account_inactive: "kontoen til saksbehandleren ikke lenger er aktiv",
  involved: "saksbehandleren ble involvert i saken",
  role_ended: "saksbehandleren ikke lenger har rollen",
  membership_ended: "saksbehandleren ikke lenger er medlem",
};

/** One step of the handling, for its handlers (UX-IA-008). */
export function describeAction(
  action: Case["history"][number],
  people: Case["people"],
): string {
  const actor = personIn(people, action.actorUserId);
  const target = personIn(people, action.targetUserId);

  switch (action.kind) {
    case "assigned":
      return action.actorUserId === action.targetUserId
        ? `${actor} tok saken`
        : `${actor} ga saken til ${target}`;
    case "released":
      return `${actor} la saken tilbake i køen`;
    case "returned_to_queue":
      return `Saken gikk tilbake til køen fordi ${returnReasons[action.reason ?? "role_ended"]}`;
    case "round_opened":
      return action.targetUserId
        ? `${actor} ba ${target} om et nytt innlegg`
        : `${actor} ba alle parter om nye innlegg`;
    case "statements_shared":
      return `${actor} delte partenes forklaringer med hverandre`;
    case "recused":
      return `${actor} trådte til side som inhabil`;
    case "closed":
      return `${actor} lukket saken`;
  }
}

/** A measure as its button names it (UX-INT-003). */
export const measureLabels: Record<ModerationMeasureKind, string> = {
  publication_rejected: "Avvis publiseringen i miljøet",
  publication_blocked: "Sperr publiseringen i miljøet",
  object_blocked: "Sperr tingen for nye lån overalt",
  object_unblocked: "Opphev sperren av tingen",
  review_removed: "Fjern anmeldelsen",
  review_text_removed: "Fjern teksten i anmeldelsen",
  review_score_removed: "Fjern én vurdering i anmeldelsen",
  review_response_removed: "Fjern tilsvaret",
};
