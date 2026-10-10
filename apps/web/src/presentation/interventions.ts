import type {
  AccountBinding,
  AccountStatus,
  Case,
  CaseInterventions,
  CaseSubjectAccount,
  PlatformIntervention,
  PlatformInterventionKind,
} from "@lanbort/contracts";
import { takesNewActivity, transitionAllowed } from "@lanbort/domain";
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
export interface Subject {
  readonly name: string;
  readonly first: string;
  readonly account: CaseSubjectAccount;
  /** The account it continues as, once retired as a duplicate. */
  readonly continues: string | null;
}

/** What the steward picks for an intervention: an environment, a thing or an account. */
export interface InterventionPick {
  readonly id: string;
  readonly name: string;
  /** For an environment: whether the account owns it. */
  readonly owner?: boolean;
}

/** A pick offered in a list, with what it means for it. */
export interface InterventionOption extends InterventionPick {
  readonly detail: string;
  readonly disabled: boolean;
}

/** What an intervention needs picked before it can be taken. */
interface InterventionChoice {
  readonly label: string;
  /** The command's field the pick goes in. */
  readonly field:
    "environmentId" | "objectId" | "continuedUserId" | "linkedUserId";
  /**
   * Picked from these; without them the account is found from its full
   * e-mail address or the link to its page (OD-0055).
   */
  options?(subject: Subject): InterventionOption[];
  /** Under the lookup: which account fits. */
  readonly hint?: string;
  /** Whether a found account can be picked, by its status. */
  usable?(status: AccountStatus): boolean;
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
  readonly choice?: InterventionChoice;
  /** Taken toward a thing, so the command names no account. */
  readonly towardObject?: true;
  /** Left out of the choices for the account as it stands. */
  hidden?(subject: Subject): boolean;
  /** Why it cannot be taken now; null when it can. */
  blocked?(subject: Subject): string | null;
  title(subject: Subject, pick: InterventionPick | null): string;
  verb(subject: Subject, pick: InterventionPick | null): string;
  consequences(
    subject: Subject,
    pick: InterventionPick | null,
  ): ConsequenceRow[];
  /** «Gjelder» in the last look; the account by default. */
  whom?(subject: Subject, pick: InterventionPick | null): string;
  done(subject: Subject, pick: InterventionPick | null): string;
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
    consequences: ({ name, continues }) => [
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
      ...(continues
        ? [
            {
              icon: "lock",
              tone: "note",
              text: `Koblingen til ${continues} består i sikkerhetsregisteret.`,
            } as const,
          ]
        : []),
    ],
    done: ({ name }) => `Avslutningen av ${name} er fullført.`,
  },
  "retire-duplicate": {
    label: "Avvikle som duplikat",
    icon: "personRemove",
    danger: true,
    short: "Når du har sjekket at to kontoer er samme person.",
    group: "identity",
    choice: {
      label: "Kontoen som videreføres",
      field: "continuedUserId",
      hint: "Kontoen som videreføres, må være aktiv.",
      usable: takesNewActivity,
    },
    // Retired already, unless its closure was ended since: then it is
    // retired again into the same account.
    hidden: ({ continues, account }) =>
      continues !== null && account.status === "closing",
    blocked: ({ account }) =>
      account.status === "suspended"
        ? "En suspendert konto avvikles ikke som duplikat. En ny konto ved siden av en suspendert er omgåelse."
        : account.status === "closing"
          ? "Kontoen er allerede under avslutning."
          : null,
    title: ({ name }) => `Avvikle ${name} som duplikat?`,
    verb: ({ name }) => `Avvikle ${name} som duplikat`,
    consequences: ({ name }, pick) => {
      const other = pick?.name ?? "den andre kontoen";

      return [
        {
          icon: "signOut",
          tone: "ends",
          text: `${name} går til kontrollert avslutning, og ${other} fortsetter som personens konto.`,
        },
        {
          icon: "people",
          tone: "note",
          text: "Ingenting sosialt flytter: lån, anmeldelser, saker, vennskap, medlemskap, roller og tillit blir der de oppstod.",
        },
        {
          icon: "loans",
          tone: "goes_on",
          text: `${name} fullfører lånene og det andre som binder kontoen, med minimumstilgang.`,
        },
        {
          icon: "things",
          tone: "goes_on",
          text: `Ting ${name} eier alene, kan du flytte til ${other} fra denne saken etterpå.`,
        },
        {
          icon: "lock",
          tone: "note",
          text: "Koblingen mellom kontoene er intern. Ingen brukere ser den.",
        },
      ];
    },
    whom: ({ name }, pick) => `${name}, videreføres som ${pick?.name ?? ""}`,
    done: ({ name }, pick) =>
      `${name} er avviklet som duplikat av ${pick?.name ?? "den andre kontoen"}.`,
  },
  "move-object": {
    label: "Flytt en ting til kontoen som videreføres",
    icon: "move",
    danger: false,
    short: "En ting duplikatet eier alene.",
    group: "identity",
    towardObject: true,
    choice: {
      label: "Tingen som skal flyttes",
      field: "objectId",
      options: ({ name, account }) =>
        account.objects.map(({ objectId, title, coOwners }) => ({
          id: objectId,
          name: title,
          detail:
            coOwners.length === 0
              ? `${name} eier den alene`
              : `Eies også av ${coOwners
                  .map(({ realName }) => realName ?? "Tidligere bruker")
                  .join(
                    " og ",
                  )}. Andre medeiere bestemmer selv, så den kan ikke flyttes herfra.`,
          disabled: coOwners.length > 0,
        })),
    },
    hidden: ({ continues }) => continues === null,
    blocked: ({ account }) =>
      account.status !== "closing"
        ? "Bare når kontoen er avviklet som duplikat og er under avslutning."
        : account.objects.every(({ coOwners }) => coOwners.length > 0)
          ? "Ingen ting å flytte."
          : null,
    title: ({ continues }, pick) =>
      `Flytte ${pick?.name ?? "en ting"} til ${continues}?`,
    verb: (_, pick) => `Flytt ${pick?.name ?? "tingen"}`,
    consequences: ({ name, continues }, pick) => [
      {
        icon: "things",
        tone: "goes_on",
        text: `${continues} blir eier av ${pick?.name ?? "tingen"}.`,
      },
      {
        icon: "signOut",
        tone: "note",
        text: `${name} går ut av tingen med en gang, eller når et pågående lån av den er avsluttet.`,
      },
      {
        icon: "close",
        tone: "note",
        text: `Ventende medeierinvitasjoner avsluttes, og tingen forsvinner fra miljøer ${continues} ikke er medlem av.`,
      },
      {
        icon: "info",
        tone: "note",
        text: "Overføringen lagres med begrunnelsen.",
      },
    ],
    whom: ({ name, continues }, pick) =>
      `${pick?.name ?? "Tingen"}, fra ${name} til ${continues}`,
    done: ({ continues }, pick) =>
      `${pick?.name ?? "Tingen"} er flyttet til ${continues}.`,
  },
  "link-person": {
    label: "Koble som samme person",
    icon: "link",
    danger: false,
    short: "Bare i sikkerhetsregisteret. Endrer ingen av kontoene.",
    group: "identity",
    choice: {
      label: "Kontoen som skal kobles",
      field: "linkedUserId",
      hint: "Brukes for eksempel for en senere konto etter falsk identitet eller for å komme rundt en suspensjon.",
    },
    hidden: ({ continues }) => continues !== null,
    title: ({ name }, pick) =>
      `Koble ${name} og ${pick?.name ?? "den andre kontoen"} som samme person?`,
    verb: () => "Koble kontoene",
    consequences: () => [
      {
        icon: "lock",
        tone: "note",
        text: "Koblingen står bare i sikkerhetsregisteret. Ingen brukere ser den.",
      },
      {
        icon: "hidden",
        tone: "note",
        text: "Den ene kontoen får ikke profil, vennskap eller tillit fra den andre.",
      },
      {
        icon: "info",
        tone: "goes_on",
        text: "Ingen av kontoene endres. Skal noe stanses, er det et eget inngrep.",
      },
    ],
    whom: ({ name }, pick) => `${name} og ${pick?.name ?? ""}`,
    done: ({ name }, pick) =>
      `${name} og ${pick?.name ?? "den andre kontoen"} er koblet som samme person.`,
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
    choice: {
      label: "Miljøet",
      field: "environmentId",
      options: ({ first, account }) =>
        account.roles.map((role) => ({
          id: role.environmentId,
          name: role.name,
          owner: role.owner,
          detail: `${first} er ${role.owner ? "eier og administrator" : "administrator"}`,
          disabled: false,
        })),
    },
    blocked: ({ first, account }) =>
      account.roles.length === 0
        ? `${first} har ingen administrator- eller eierroller.`
        : null,
    title: ({ name }, pick) =>
      `Avslutte rollene til ${name} i ${pick?.name ?? "miljøet"}?`,
    verb: ({ first }) => `Avslutt rollene til ${first}`,
    consequences: ({ name }, pick) => [
      {
        icon: "environment",
        tone: "ends",
        text: `${name} er ikke lenger ${pick?.owner ? "eier og administrator" : "administrator"} i ${pick?.name ?? "miljøet"}.`,
      },
      ...(pick?.owner
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
    whom: ({ name }, pick) => `${name} i ${pick?.name ?? "miljøet"}`,
    done: ({ name }, pick) =>
      `Rollene til ${name} i ${pick?.name ?? "miljøet"} er avsluttet.`,
  },
} satisfies Record<string, InterventionFlow>;

export type InterventionFlowKey = keyof typeof interventionFlows;

/** The headings the choices are grouped under, in order. */
export const interventionGroups = [
  { key: "account", heading: "Kontoen" },
  { key: "identity", heading: "Duplikat og identitet" },
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
  const { duplicateOf } = account;

  return {
    name,
    first: name.split(" ")[0] ?? name,
    account,
    continues: duplicateOf && personIn([duplicateOf], duplicateOf.userId),
  };
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

  if (
    status === "deleted" ||
    status === "pending_registration" ||
    flow.hidden?.(subject)
  ) {
    return { shown: false };
  }

  return { shown: true, blocked: flow.blocked?.(subject) ?? null };
}

/** An intervention as the steward takes it, with what was picked for it. */
export interface InterventionVariant {
  /** What the command takes besides the case and the basis. */
  readonly fields: Readonly<Record<string, string>>;
  readonly title: string;
  readonly verb: string;
  readonly rows: readonly ConsequenceRow[];
  readonly whom: string;
  readonly done: string;
}

export function interventionVariant(
  key: InterventionFlowKey,
  subject: Subject,
  pick: InterventionPick | null,
): InterventionVariant {
  const flow: InterventionFlow = interventionFlows[key];

  return {
    fields: {
      ...(flow.towardObject ? {} : { userId: subject.account.userId }),
      ...(flow.choice && pick ? { [flow.choice.field]: pick.id } : {}),
    },
    title: flow.title(subject, pick),
    verb: flow.verb(subject, pick),
    rows: flow.consequences(subject, pick),
    whom: flow.whom?.(subject, pick) ?? subject.name,
    done: flow.done(subject, pick),
  };
}

/** What has to be picked for it, if anything, and the options to pick from. */
export function interventionChoice(key: InterventionFlowKey, subject: Subject) {
  const flow: InterventionFlow = interventionFlows[key];
  const { choice } = flow;

  return choice
    ? {
        label: choice.label,
        hint: choice.hint ?? null,
        options: choice.options?.(subject) ?? null,
        usable: choice.usable ?? (() => true),
      }
    : null;
}
