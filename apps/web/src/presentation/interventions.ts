import type {
  AccountBinding,
  AccountStatus,
  Case,
  CaseInterventions,
  CaseSubjectAccount,
  PlatformIntervention,
  PlatformInterventionKind,
} from "@lanbort/contracts";
import { transitionAllowed } from "@lanbort/domain";
import type { IconName } from "@/components/icon";
import { personIn } from "./cases";

/**
 * Platform stewards' interventions as their handlers read them on the case
 * (PS-ADM-014–015, «Plattformforvaltning v1»): what was done, and to whom.
 */
export const interventionLabels: Record<PlatformInterventionKind, string> = {
  account_suspended: "Suspendert konto",
  account_reinstated: "Gjeninnsatt konto",
  account_closure_started: "Startet kontrollert avslutning",
  account_closure_completed: "Fullført kontrollert avslutning",
  account_retired_as_duplicate: "Avviklet som duplikat",
  accounts_linked_as_same_person: "Koblet som samme person",
  false_identity_recorded: "Registrert falsk identitet",
  object_moved_from_duplicate: "Flyttet en ting fra duplikatet",
  environment_roles_ended: "Avsluttet rollene i et miljø",
};

/** «Gjelder»: the account, and what else the intervention names. */
export function interventionSubject(
  item: PlatformIntervention,
  names: Pick<CaseInterventions, "people" | "environments" | "objects">,
): string {
  const person = (userId: string | null) => personIn(names.people, userId);
  const subject = person(item.userId);

  switch (item.kind) {
    case "account_retired_as_duplicate":
      return `${subject}, videreføres som ${person(item.otherUserId)}`;
    case "accounts_linked_as_same_person":
      return `${subject} og ${person(item.otherUserId)}`;
    case "object_moved_from_duplicate": {
      const title = names.objects.find(({ id }) => id === item.objectId)?.title;
      return title ? `«${title}» fra ${subject}` : `En ting fra ${subject}`;
    }
    case "environment_roles_ended": {
      const environment = names.environments.find(
        ({ id }) => id === item.environmentId,
      )?.name;
      return environment ? `${subject} i ${environment}` : subject;
    }
    default:
      return subject;
  }
}

/** «Besluttet av»: the reader themself, or the steward by name. */
export const decidedBy = (
  item: PlatformIntervention,
  people: CaseInterventions["people"],
  userId: string,
) =>
  item.decidedByUserId === userId
    ? "Deg"
    : personIn(people, item.decidedByUserId, "En forvalter");

/** How an account stands, as a steward reads it on the case. */
export const accountStatusLabels: Record<AccountStatus, string> = {
  pending_registration: "ikke registrert",
  active: "aktiv",
  dormant: "i hvile",
  deactivated: "deaktivert",
  suspended: "suspendert",
  closing: "under kontrollert avslutning",
  deleted: "slettet",
};

/** What still binds an account, in a sentence (PS-ADM-004). */
const bindingLabels: Record<AccountBinding["kind"], string> = {
  loan: "et lån som ikke er avsluttet",
  environment_ownership: "eierskap i et miljø",
  case: "en åpen mekling",
};

/** One line of what an intervention does, marked by what it means. */
export interface ConsequenceRow {
  readonly icon: IconName;
  /** `ends`: stops or goes; `goes_on`: continues; `note`: otherwise. */
  readonly tone: "ends" | "goes_on" | "note";
  readonly text: string;
}

/** Who an intervention is toward, as its sentences name them. */
interface Subject {
  readonly name: string;
  readonly first: string;
  readonly account: CaseSubjectAccount;
}

/**
 * An intervention a steward takes from the case, with the same steps each
 * time: consequences, basis, then confirm (PS-ADM-014–015, «Plattform-
 * forvaltning v1»). `to` is the account status it moves to, where it
 * changes one; whether it may is the domain's transition list.
 */
interface InterventionFlow {
  readonly label: string;
  readonly icon: IconName;
  readonly danger: boolean;
  /** What it does, in the list of choices. */
  readonly short: string;
  readonly group: "account" | "identity" | "roles";
  readonly to?: AccountStatus;
  /** Why it cannot be taken now; null when it can. */
  blocked?(subject: Subject): string | null;
  title(subject: Subject, environment: string | null): string;
  verb(subject: Subject): string;
  consequences(
    subject: Subject,
    role: CaseSubjectAccount["roles"][number] | null,
  ): ConsequenceRow[];
  done(subject: Subject, environment: string | null): string;
}

const rolesGoOn = ({ first, account }: Subject): ConsequenceRow[] =>
  account.roles.length > 0
    ? [
        {
          icon: "environment",
          tone: "note",
          text: `Rollene ${first} har i miljøer, går videre etter de vanlige reglene.`,
        },
      ]
    : [];

export const interventionFlows = {
  suspend: {
    label: "Suspender kontoen",
    icon: "block",
    danger: true,
    short: "Stanser ny aktivitet. Overleverte ting følges til retur.",
    group: "account",
    to: "suspended",
    title: ({ name }) => `Suspendere kontoen til ${name}?`,
    verb: () => "Suspender kontoen",
    consequences: (subject) => [
      {
        icon: "block",
        tone: "ends",
        text: `${subject.first} kan ikke starte noe nytt i Lånbort: ingen nye forespørsler, lån, ting eller innlegg.`,
      },
      {
        icon: "close",
        tone: "ends",
        text: "Forespørsler som ikke er godkjent, avsluttes nøytralt.",
      },
      {
        icon: "loans",
        tone: "ends",
        text: "Reserverte lån som ikke er overlevert, stanses. Motparten får vite at lånet ikke kan gjennomføres på grunn av en begrensning, ikke hvorfor.",
      },
      {
        icon: "things",
        tone: "goes_on",
        text: `Ting som allerede er overlevert, følges til de er levert tilbake. ${subject.first} beholder tilgangen som trengs til det.`,
      },
      ...rolesGoOn(subject),
      {
        icon: "info",
        tone: "note",
        text: "Kan oppheves fra en sak. Lån som ble stanset, kommer ikke tilbake.",
      },
    ],
    done: ({ name }) =>
      `Kontoen til ${name} er suspendert. Inngrepet står i saken.`,
  },
  reinstate: {
    label: "Gjeninnsett kontoen",
    icon: "check",
    danger: false,
    short: "Opphever suspensjonen eller en avslutning som ikke er fullført.",
    group: "account",
    to: "active",
    title: ({ name }) => `Gjeninnsette kontoen til ${name}?`,
    verb: () => "Gjeninnsett kontoen",
    consequences: ({ first, account }) => [
      {
        icon: "check",
        tone: "goes_on",
        text: `${first} kan bruke Lånbort som vanlig igjen.`,
      },
      ...(account.status === "closing"
        ? [
            {
              icon: "close",
              tone: "goes_on",
              text: "Den kontrollerte avslutningen stanses.",
            } as const,
          ]
        : []),
      {
        icon: "close",
        tone: "note",
        text: "Reserverte lån som ble stanset, kommer ikke tilbake.",
      },
    ],
    done: ({ name }) => `Kontoen til ${name} er gjeninnsatt.`,
  },
  "start-closure": {
    label: "Start kontrollert avslutning",
    icon: "close",
    danger: true,
    short: "Kontoen avsluttes når ingenting binder den lenger.",
    group: "account",
    to: "closing",
    title: ({ name }) => `Starte kontrollert avslutning av ${name}?`,
    verb: () => "Start avslutningen",
    consequences: (subject) => [
      {
        icon: "block",
        tone: "ends",
        text: `${subject.first} kan ikke starte noe nytt.`,
      },
      {
        icon: "close",
        tone: "note",
        text: "Forespørsler som ikke er godkjent, avsluttes.",
      },
      {
        icon: "loans",
        tone: "goes_on",
        text: `Lån og saker som allerede pågår, fullføres etter de vanlige reglene. ${subject.first} beholder tilgangen som trengs.`,
      },
      ...rolesGoOn(subject),
      {
        icon: "check",
        tone: "note",
        text: "Når ingenting binder kontoen lenger, fullfører en forvalter avslutningen fra en sak.",
      },
      {
        icon: "info",
        tone: "note",
        text: "Til den er fullført, kan avslutningen oppheves med «Gjeninnsett kontoen».",
      },
    ],
    done: ({ name }) => `Avslutningen av ${name} er startet.`,
  },
  "complete-closure": {
    label: "Fullfør avslutningen",
    icon: "trash",
    danger: true,
    short: "Ingenting binder kontoen lenger.",
    group: "account",
    to: "deleted",
    blocked: ({ account }) =>
      account.bindings.length > 0
        ? `Kan ikke fullføres ennå. Dette binder fortsatt kontoen: ${[
            ...new Set(account.bindings.map(({ kind }) => bindingLabels[kind])),
          ].join(" og ")}.`
        : null,
    title: ({ name }) => `Fullføre avslutningen av ${name}?`,
    verb: () => "Fullfør avslutningen",
    consequences: ({ name }) => [
      {
        icon: "trash",
        tone: "ends",
        text: `Kontoen til ${name} slettes. Profil, vennskap og medlemskap forsvinner.`,
      },
      {
        icon: "info",
        tone: "goes_on",
        text: "Felles historikk, som lån og saker, består uten navn.",
      },
      {
        icon: "things",
        tone: "note",
        text: "Ting kontoen eier alene, slettes. Ting den eier sammen med andre, blir hos de andre.",
      },
    ],
    done: ({ name }) => `Avslutningen av ${name} er fullført.`,
  },
  "false-identity": {
    label: "Registrer falsk identitet",
    icon: "person",
    danger: false,
    short: "Et internt signal. Endrer ingenting av seg selv.",
    group: "identity",
    title: ({ name }) => `Registrere falsk identitet for ${name}?`,
    verb: () => "Registrer funnet",
    consequences: ({ first }) => [
      {
        icon: "info",
        tone: "note",
        text: "Funnet føres som et internt signal på kontoen. Ingen brukere ser det.",
      },
      {
        icon: "info",
        tone: "goes_on",
        text: `Det endrer ingenting av seg selv: ${first} kan bruke kontoen som før til du suspenderer den eller starter en kontrollert avslutning.`,
      },
      {
        icon: "loans",
        tone: "note",
        text: "Tidligere lån og anmeldelser består.",
      },
    ],
    done: () => "Funnet er registrert. Ingenting annet er endret.",
  },
  "end-roles": {
    label: "Avslutt rollene i et miljø",
    icon: "environment",
    danger: true,
    short: "Administrator- og eierroller i ett miljø.",
    group: "roles",
    blocked: ({ first, account }) =>
      account.roles.length === 0
        ? `${first} har ingen administrator- eller eierroller.`
        : null,
    title: ({ name }, environment) =>
      `Avslutte rollene til ${name} i ${environment ?? "miljøet"}?`,
    verb: ({ first }) => `Avslutt rollene til ${first}`,
    consequences: ({ name }, role) => [
      {
        icon: "environment",
        tone: "ends",
        text: `${name} er ikke lenger ${role?.owner ? "eier og administrator" : "administrator"} i ${role?.name ?? "miljøet"}.`,
      },
      ...(role?.owner
        ? [
            {
              icon: "clock",
              tone: "goes_on",
              text: "Eierplassen følger de vanlige reglene: de andre administratorene får 7 dager til å melde interesse, og den som har vært administrator lengst, blir eier. Overtar ingen, avvikles miljøet.",
            } as const,
          ]
        : []),
      {
        icon: "shield",
        tone: "note",
        text: "Ingen får rollen eller eierskapet fra deg eller fra Lånbort.",
      },
      {
        icon: "people",
        tone: "note",
        text: "Medlemmene ser bare resultatet: hvem som er administrator og eier nå. Ikke saken og ikke begrunnelsen.",
      },
    ],
    done: ({ name }, environment) =>
      `Rollene til ${name} i ${environment ?? "miljøet"} er avsluttet.`,
  },
} satisfies Record<string, InterventionFlow>;

export type InterventionFlowKey = keyof typeof interventionFlows;

/** The headings the choices are grouped under, in order. */
export const interventionGroups = [
  { key: "account", heading: "Kontoen" },
  { key: "identity", heading: "Identitet" },
  { key: "roles", heading: "Roller i miljøer" },
] as const;

export const interventionFlowKeys = Object.keys(
  interventionFlows,
) as InterventionFlowKey[];

export const isInterventionFlowKey = (
  key: string,
): key is InterventionFlowKey => key in interventionFlows;

/** The account's holder, by name and first name, for the sentences. */
export function subjectOf(
  people: Case["people"],
  account: CaseSubjectAccount,
): Subject {
  const name = personIn(people, account.userId);

  return { name, first: name.split(" ")[0] ?? name, account };
}

/**
 * Whether the steward may choose it now: hidden where the account's status
 * gives it no meaning, otherwise why it cannot be taken, or null.
 */
export function interventionStanding(
  key: InterventionFlowKey,
  subject: Subject,
): { shown: false } | { shown: true; blocked: string | null } {
  const flow: InterventionFlow = interventionFlows[key];
  const { status } = subject.account;

  if (
    flow.to &&
    !transitionAllowed({ from: status, to: flow.to, reason: "platform" })
  ) {
    return { shown: false };
  }

  if (status === "deleted" || status === "pending_registration") {
    return { shown: false };
  }

  return { shown: true, blocked: flow.blocked?.(subject) ?? null };
}
