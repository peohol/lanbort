import type {
  Case,
  CaseKind,
  CaseParticipantRole,
  CaseQueueReturnReason,
  CaseSummary,
  ModerationMeasureKind,
  ReportTargetKind,
} from "@lanbort/contracts";
import { caseKinds } from "@lanbort/domain";
import type { IconName } from "@/components/icon";
import type { Tone } from "@/components/tag";
import { formatShortTime } from "./dates";

/** A picture of the thing a case names, behind the case's policy (PS-OBJ-021). */
export const caseImageHref = (caseId: string, imageId: string) =>
  `/api/cases/${caseId}/images/${imageId}`;

/** What kind of case it is, in the user's words. */
export const caseKindLabels: Record<CaseKind, string> = {
  environment_contact: "Kontakt med administratorene",
  loan_mediation: "Mekling om et lån",
  unavailability_report: "Melding om at noen kan være utilgjengelig",
  environment_report: "Rapport",
  platform_report: "Rapport til Lånbort",
  platform_inquiry: "Saksgrunnlag for inngrep",
};

/** The icon of each kind, in lists and on Home (Tomat kjerneflyt 8). */
export const caseKindIcons: Record<CaseKind, IconName> = {
  environment_contact: "conversations",
  loan_mediation: "loans",
  unavailability_report: "person",
  environment_report: "flag",
  platform_report: "flag",
  platform_inquiry: "flag",
};

/**
 * Who handles a kind: a function, never a person (PS-COM-010), named with
 * its environment where the reader may see it («Administratorene i
 * Borettslaget Lia»), on its own and in a sentence.
 */
export function handlerFunction(kind: CaseKind, environment: string | null) {
  if (caseKinds[kind].platform) return "Lånbort";

  return environment
    ? `Administratorene i ${environment}`
    : "Miljøets administratorer";
}

/** Who handles a case of `kind`, inside a sentence. */
export const handlersInSentence = (
  kind: CaseKind,
  environment: string | null,
) =>
  caseKinds[kind].platform
    ? "Lånbort"
    : environment
      ? `administratorene i ${environment}`
      : "miljøets administratorer";

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

/** What Lånbort assesses (PS-TRUST-013), where a report may go there. */
export const platformReportHelp =
  "For alvorlig misbruk, brudd på Lånborts regler og det som gjelder sikkerhet eller lovlighet. En forvalter hos Lånbort tar saken.";

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

/** What a case is about, in its title and its row in a list. */
type About = Pick<
  CaseSummary,
  "kind" | "reportTarget" | "subjectUserId" | "title" | "people"
>;

/**
 * The case's title: what it is about, as far as the viewer knows
 * («Mekling om Sykkelhenger», «Rapport om «Gassflaske 11 kg»»). A contact
 * is named from the reader's side: the member wrote to the administrators,
 * who see whom it is from.
 */
export function caseTitle(
  c: About,
  from: { readonly handler: boolean; readonly opener: string | null } = {
    handler: false,
    opener: null,
  },
): string {
  const subject = () => personIn(c.people, c.subjectUserId);

  switch (c.kind) {
    case "environment_contact":
      return from.handler && from.opener
        ? `Henvendelse fra ${from.opener}`
        : "Henvendelse til administratorene";
    case "loan_mediation":
      return c.title ? `Mekling om ${c.title}` : caseKindLabels[c.kind];
    case "unavailability_report":
      return `Melding om ${subject()}`;
    case "platform_inquiry":
      if (c.reportTarget === "user") return `Saksgrunnlag om ${subject()}`;
      return c.title ? `Saksgrunnlag om «${c.title}»` : caseKindLabels[c.kind];
    default:
      if (c.reportTarget === "user") return `Rapport om ${subject()}`;
      if (c.reportTarget === "object" && c.title) {
        return `Rapport om «${c.title}»`;
      }

      return c.reportTarget
        ? `Rapport om ${reportTargetLabels[c.reportTarget]}`
        : caseKindLabels[c.kind];
  }
}

/** The case's own view as `About`. */
export const aboutCase = (c: Case): About => ({
  ...c,
  title: c.loanTitle ?? c.objectTitle,
});

/** The kind above the title (UX-IA-015): «Rapport», «Mekling om et lån». */
export const caseKindTitle: Record<CaseKind, string> = {
  ...caseKindLabels,
  environment_report: "Rapport",
  platform_report: "Rapport",
  unavailability_report: "Melding",
};

/** Who opened the case, by name, for its handlers. */
export const openerOf = (c: Pick<Case, "participants" | "people">) => {
  const opener = c.participants.find(
    (participant) =>
      participant.role === "requester" || participant.role === "reporter",
  );

  return opener ? personIn(c.people, opener.userId) : null;
};

export interface HandlingStatus {
  /** The short state above the status («Venter på administratorene»). */
  readonly label: string;
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
  viewer: {
    readonly userId: string;
    readonly asHandler: boolean;
    readonly environment?: string | null;
  },
  nameOf: (userId: string) => string,
): HandlingStatus {
  const handlers = handlersInSentence(c.kind, viewer.environment ?? null);

  if (c.status === "closed") {
    return {
      label: "Lukket",
      text: "Saken er lukket",
      tone: "neutral",
      detail: "Alt som er skrevet, blir stående.",
    };
  }

  if (c.handling === "unavailable") {
    return {
      label: "Står på vent",
      text: "Ingen kan behandle saken nå",
      detail: caseKinds[c.kind].platform
        ? "Det finnes ingen hos Lånbort som kan ta saken akkurat nå. Den blir liggende trygt til noen kan."
        : `Det finnes ingen ${viewer.environment ? `i ${viewer.environment} ` : ""}som kan ta saken akkurat nå. Den blir liggende trygt til noen kan${viewer.asHandler ? "" : ", og du får beskjed da"}.`,
      tone: "warning",
    };
  }

  if (c.handling === "queued") {
    return viewer.asHandler
      ? {
          label: "Ingen har tatt saken",
          text: "Ingen har tatt saken ennå",
          tone: "waiting",
        }
      : {
          label: caseKinds[c.kind].platform
            ? "Venter på Lånbort"
            : "Venter på administratorene",
          text: `Venter på at ${handlers} tar saken`,
          tone: "waiting",
        };
  }

  if (!viewer.asHandler || c.assigneeUserId === null) {
    return {
      label: "Tatt",
      text: caseKinds[c.kind].platform
        ? "Lånbort har saken"
        : "En administrator har saken",
      tone: "positive",
    };
  }

  const mine = c.assigneeUserId === viewer.userId;

  return {
    label: mine ? "Du har saken" : "Tatt",
    text: mine ? "Du har saken" : `${nameOf(c.assigneeUserId)} har saken`,
    tone: mine ? "attention" : "positive",
  };
}

/** What a participant may do now, said plainly (PS-COM-012). */
export function participantTurn(c: Case, userId: string): string | null {
  if (c.status === "closed" || c.kind === "environment_contact") {
    return null;
  }

  const separate = caseKinds[c.kind].separateStatements;
  const wrote = c.entries.some(
    (entry) => entry.capacity === "party" && entry.authorUserId === userId,
  );

  if (c.mayWrite) {
    return separate && !wrote
      ? "Skriv din forklaring. Du ser ikke den andre partens før administratoren deler dem."
      : "Du kan skrive et innlegg nå. Etter det venter du til saksbehandleren ber om mer.";
  }

  return separate
    ? "Du har skrevet forklaringen din. Du kan skrive igjen når saksbehandleren ber om mer."
    : "Du kan skrive igjen når saksbehandleren ber om mer.";
}

/** Who sees an entry, for its handlers, with the icon that says it. */
export function audienceLabel(
  entry: Pick<Case["entries"][number], "audience" | "toUserId" | "shared">,
  people: Case["people"],
  c: Pick<Case, "kind" | "participants">,
): { text: string; icon: IconName } {
  if (entry.audience === "handlers") {
    return { text: "Internt notat, bare for saksbehandlerne", icon: "lock" };
  }

  if (entry.audience === "party") {
    return {
      text: `Bare til ${personIn(people, entry.toUserId)}`,
      icon: "person",
    };
  }

  if (c.kind === "loan_mediation" && !entry.shared) {
    return { text: "Ikke delt med den andre parten ennå", icon: "hidden" };
  }

  return {
    text:
      c.participants.length > 1
        ? "Alle parter ser dette"
        : `${personIn(people, c.participants[0]?.userId ?? null)} ser dette`,
    icon: "people",
  };
}

/** Who wrote an entry, as the viewer may know it. */
export function entryAuthor(
  entry: Pick<Case["entries"][number], "capacity" | "authorUserId">,
  c: Pick<Case, "kind" | "people">,
  viewer: { readonly userId: string; readonly environment: string | null },
): string {
  if (entry.capacity === "handler") {
    if (entry.authorUserId === null) {
      return handlerFunction(c.kind, viewer.environment);
    }

    return entry.authorUserId === viewer.userId
      ? "Du (saksbehandler)"
      : `${personIn(c.people, entry.authorUserId)} (saksbehandler)`;
  }

  return entry.authorUserId === viewer.userId
    ? "Du"
    : personIn(c.people, entry.authorUserId);
}

const returnReasons: Record<CaseQueueReturnReason, string> = {
  account_inactive: "kontoen til saksbehandleren ikke lenger er aktiv",
  involved: "saksbehandleren ble involvert i saken",
  role_ended: "saksbehandleren ikke lenger har rollen",
  membership_ended: "saksbehandleren ikke lenger er medlem",
};

/**
 * One step of the handling, for its handlers (UX-IA-008). The one who
 * opened the case may have ended it themselves (PS-COM-021).
 */
export function describeAction(
  action: Case["history"][number],
  c: Pick<Case, "people" | "participants">,
): string {
  const { people } = c;
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
      return c.participants.some(({ userId }) => userId === action.actorUserId)
        ? `${actor} avsluttet henvendelsen`
        : `${actor} lukket saken`;
    case "withdrawn":
      return `${actor} trakk rapporten`;
  }
}

/**
 * PS-COM-021: a withdrawn report that is still open, said so that nobody
 * takes it for deleted or stopped.
 */
export function withdrawalText(
  c: Pick<Case, "kind" | "status" | "withdrawnAt" | "people" | "participants">,
  viewer: { readonly asHandler: boolean; readonly environment: string | null },
): string | null {
  if (c.withdrawnAt === null || c.status !== "open") return null;

  const when = formatShortTime(c.withdrawnAt);

  return viewer.asHandler
    ? `${openerOf(c) ?? "Den som rapporterte"} trakk rapporten ${when}. Det som er sendt inn, blir stående, og dere kan likevel fullføre vurderingen og gjøre tiltak hvis det trengs.`
    : `Du trakk rapporten ${when}. Det du har skrevet, blir stående, og ${handlersInSentence(c.kind, viewer.environment)} kan likevel fullføre vurderingen.`;
}

/** A measure as its button names it (UX-INT-003). */
export const measureLabels: Record<ModerationMeasureKind, string> = {
  publication_rejected: "Avvis publiseringen",
  publication_blocked: "Sperr publiseringen",
  object_blocked: "Sperr tingen for nye lån overalt",
  object_unblocked: "Opphev sperren av tingen",
  review_removed: "Fjern anmeldelsen",
  review_text_removed: "Fjern teksten i anmeldelsen",
  review_score_removed: "Fjern én vurdering i anmeldelsen",
  review_response_removed: "Fjern tilsvaret",
};

/** What a measure does, under its name where it is chosen (PS-OBJ-017). */
export const measureEffects: Partial<Record<ModerationMeasureKind, string>> = {
  publication_rejected:
    "Tingen vises ikke i miljøet. Eieren kan publisere den på nytt.",
  publication_blocked:
    "Tingen kan ikke publiseres i miljøet igjen før en administrator opphever sperren.",
};

/**
 * PS-COM-022: the next step in a mediation whose loan the parties have
 * clarified themselves. It is tidying up, and goes after what is urgent.
 */
export const loanClarifiedText = "Lånet er avklart av partene";

/**
 * A queue in the order work is done (Tomat kjerneflyt 8): what nobody has
 * taken, then the reader's own, then others'. Mediations whose loan the
 * parties have clarified are tidying up and come after all of these, so
 * they never go before what is urgent, whoever has them (PS-COM-022); each
 * row still says who has it.
 */
export function queueGroups(
  cases: readonly CaseSummary[],
  userId: string,
): { key: string; heading: string; cases: CaseSummary[] }[] {
  const groups = [
    {
      key: "ingen",
      heading: "Ingen har tatt",
      has: (c: CaseSummary) => c.assigneeUserId === null,
    },
    {
      key: "du",
      heading: "Du har",
      has: (c: CaseSummary) => c.assigneeUserId === userId,
    },
    {
      key: "andre",
      heading: "Andre har",
      has: (c: CaseSummary) =>
        c.assigneeUserId !== null && c.assigneeUserId !== userId,
    },
  ];
  const ranked = (list: readonly CaseSummary[]) =>
    groups.flatMap(({ has }) => list.filter(has));
  const urgent = cases.filter((c) => !c.loanClarified);

  return [
    ...groups.map(({ key, heading, has }) => ({
      key,
      heading,
      cases: urgent.filter(has),
    })),
    {
      key: "avklart",
      heading: "Avklart av partene",
      cases: ranked(cases.filter((c) => c.loanClarified)),
    },
  ].filter((group) => group.cases.length > 0);
}
