import {
  type HomeItem,
  type HomeItemKind,
  homeItemKinds,
} from "@lanbort/contracts";
import type { IconName } from "@/components/icon";
import type { Tone } from "@/components/tag";
import { calendarDay, formatDay, formatShortPeriod, formatTime } from "./dates";
import { describeHomeItem } from "./home-items";

/**
 * Home as the user reads it (UX-IA-016–018, «Hjem og varsler v3»): what
 * waits for them as a verb and what it is about, the day's tasks as full
 * cards, what is coming by its day, and what is unsettled by whom it waits
 * for. Every sentence names only what the item carries, and a deleted
 * person or a hidden environment simply goes unnamed (UX-PRIV-010).
 */

const thing = (item: HomeItem) => item.title ?? "tingen";
/** The other party, or a neutral word for them. */
const them = (item: HomeItem) => item.person ?? "den andre parten";
const Them = (item: HomeItem) => item.person ?? "Den andre parten";
const lending = (item: HomeItem) => item.role === "lender";
const shortPeriod = (item: HomeItem) =>
  item.period ? ` ${formatShortPeriod(item.period)}` : "";
const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

/** What a task asks, and how it is reached. */
interface TaskWords {
  /** What to do, as a verb: «Svar på forespørselen». */
  readonly action: string;
  /** What it is about: «Per Lien vil låne stigen 14.–15. oktober». */
  readonly about: (item: HomeItem) => string;
  /** The step on a full card, which opens the work surface. */
  readonly open: string;
  readonly icon: IconName;
  /**
   * The same task, many at once (UX-IA-018); kinds without it are never
   * grouped.
   */
  readonly many?: ((count: number) => string) | undefined;
}

const task = (
  action: string,
  about: TaskWords["about"],
  open: string,
  icon: IconName,
  many?: TaskWords["many"],
): TaskWords => ({ action, about, open, icon, many });

type AwaitingKind = {
  [K in HomeItemKind]: (typeof homeItemKinds)[K] extends "awaiting_you"
    ? K
    : never;
}[HomeItemKind];

const tasks: Record<AwaitingKind, TaskWords> = {
  "loan_request.answer": task(
    "Svar på forespørselen",
    (item) =>
      `${item.person ?? "Noen"} vil låne ${thing(item)}${shortPeriod(item)}`,
    "Se forespørselen",
    "loans",
    (count) => `Svar på ${count} forespørsler`,
  ),
  "loan_request.confirm_terms": task(
    "Bekreft de nye vilkårene",
    (item) =>
      `Vilkårene for ${thing(item)} er endret. Forespørselen din står på vent.`,
    "Se forespørselen",
    "info",
  ),
  "loan_request.accept_responsibility": task(
    "Godta ansvarserklæringen",
    (item) => `Lånet av ${thing(item)} mellom venner`,
    "Se forespørselen",
    "shield",
  ),
  "loan.answer_amendment": task(
    "Svar på forslaget",
    (item) => `${Them(item)} foreslår en ny periode for ${thing(item)}`,
    "Se forslaget",
    "calendar",
  ),
  "loan.answer_responsibility": task(
    "Svar om ansvaret",
    (item) => `Hvem som skal være ansvarlig utlåner for ${thing(item)}`,
    "Gå til lånet",
    "people",
  ),
  "loan.take_over_responsibility": task(
    "Overta ansvaret",
    (item) => `Du kan bli ansvarlig utlåner for ${thing(item)}`,
    "Gå til lånet",
    "people",
  ),
  "loan.report_handover": task(
    "Bekreft overleveringen",
    (item) =>
      lending(item)
        ? `Fikk ${them(item)} ${thing(item)}?`
        : `Fikk du ${thing(item)} fra ${them(item)}?`,
    "Gå til overleveringen",
    "loans",
  ),
  "loan.report_return": task(
    "Meld returen",
    (item) => `Du leverer ${thing(item)} tilbake til ${them(item)}`,
    "Gå til returen",
    "loans",
  ),
  "loan.confirm_return": task(
    "Bekreft returen",
    (item) => `Har du fått ${thing(item)} tilbake fra ${them(item)}?`,
    "Gå til returen",
    "check",
    (count) => `Bekreft ${count} returer`,
  ),
  "loan.confirm_control": task(
    "Bekreft at du har tingen",
    (item) => `${thing(item)} kan ikke lånes ut igjen før du har bekreftet det`,
    "Gå til lånet",
    "check",
  ),
  "loan.write_review": task(
    "Skriv anmeldelse",
    (item) => `Lånet av ${thing(item)} er avsluttet`,
    "Skriv anmeldelse",
    "edit",
    (count) => `Skriv ${count} anmeldelser`,
  ),
  "social.answer_friend_request": task(
    "Svar på venneforespørselen",
    (item) => `${item.title ?? "Noen"} vil bli venn med deg`,
    "Se forespørselen",
    "person",
    (count) => `Svar på ${count} venneforespørsler`,
  ),
  "object.answer_co_owner_invitation": task(
    "Svar på invitasjonen",
    (item) => `Bli medeier av ${thing(item)}`,
    "Se invitasjonen",
    "things",
  ),
  "environment.answer_invitation": task(
    "Svar på invitasjonen",
    (item) => `Bli med i ${item.title}`,
    "Se invitasjonen",
    "environment",
  ),
  "environment.answer_requirements": task(
    "Svar på medlemskravene",
    (item) => `${item.title} trenger svar fra deg`,
    "Gå til miljøet",
    "environment",
  ),
  "environment.confirm_membership": task(
    "Bekreft medlemskapet",
    (item) => `Vil du fortsatt bli med i ${item.title}?`,
    "Gå til miljøet",
    "environment",
  ),
  "environment.answer_role_invitation": task(
    "Svar på invitasjonen",
    (item) => `Ta en rolle i ${item.title}`,
    "Se invitasjonen",
    "environment",
  ),
  "environment.answer_type_change": task(
    "Svar på endringen",
    (item) => `Nytt personvern i ${item.title}`,
    "Gå til miljøet",
    "environment",
  ),
};

/** Only what waits for the user is a task; anything else says what it is. */
const taskOf = (item: HomeItem): TaskWords =>
  homeItemKinds[item.kind] === "awaiting_you"
    ? tasks[item.kind as AwaitingKind]
    : task(describeHomeItem(item).text, () => "", "Åpne", "info");

/** A task as a row: the verb, and what it is about. */
export function homeRow(item: HomeItem): {
  action: string;
  about: string;
  icon: IconName;
} {
  const words = taskOf(item);

  return { action: words.action, about: words.about(item), icon: words.icon };
}

/** A full card (UX-IA-018): why it is today, what it is, and the way on. */
export interface HomeCard {
  readonly tag: {
    readonly text: string;
    readonly tone: Tone;
    readonly icon: IconName;
  };
  readonly title: string;
  /** What to do and by when, in a sentence or two. */
  readonly hint: string | null;
  readonly open: string;
}

const handoverKinds = new Set<HomeItemKind>(["loan.report_handover"]);
const returnKinds = new Set<HomeItemKind>([
  "loan.report_return",
  "loan.confirm_return",
]);

/** The day an item's deadline falls on, in the product's time zone. */
const dueDay = (item: HomeItem) =>
  item.dueAt ? calendarDay(new Date(item.dueAt)) : null;

/**
 * Whether a task waiting for the user is a full card: its day or deadline
 * is today or past (UX-IA-018), or it is the only task, so Home leads with
 * it. Grouping never takes one of these.
 */
export function isCard(item: HomeItem, today: string, alone: boolean): boolean {
  const due = dueDay(item);

  return (
    alone ||
    (item.day !== null && item.day <= today) ||
    (due !== null && due <= today)
  );
}

function deadline(item: HomeItem): string {
  return item.dueAt ? ` Svar innen ${formatTime(item.dueAt)}.` : "";
}

/** The card of a task that waits for the user. */
export function homeCard(item: HomeItem, today: string): HomeCard {
  const words = taskOf(item);
  const isToday = item.day === today;
  const past = item.day !== null && item.day < today;
  const dueToday = dueDay(item) === today;
  const asked = item.kind === "loan_request.answer" ? item.period : null;
  const one = "Det holder at én av dere bekrefter.";

  if (handoverKinds.has(item.kind) && (isToday || past)) {
    return {
      tag: isToday
        ? { text: "I dag", tone: "attention", icon: "calendar" }
        : { text: "Overlevering avklares", tone: "attention", icon: "info" },
      title: isToday
        ? lending(item)
          ? `I dag gir du ${thing(item)} til ${them(item)}`
          : `I dag henter du ${thing(item)} hos ${them(item)}`
        : words.about(item),
      hint: isToday
        ? lending(item)
          ? `Bekreft når ${them(item)} har fått den. ${one}`
          : `Bekreft når du har fått den. ${one}`
        : `Overleveringen var avtalt ${formatDay(item.day!)}.${deadline(item)}`,
      open: words.open,
    };
  }

  if (returnKinds.has(item.kind) && (isToday || past)) {
    return {
      tag: isToday
        ? { text: "Avtalt i dag", tone: "attention", icon: "calendar" }
        : { text: "Retur avklares", tone: "attention", icon: "info" },
      title: words.about(item),
      hint: `Returen var avtalt ${isToday ? "i dag" : formatDay(item.day!)}. ${
        item.kind === "loan.report_return"
          ? "Meld når du har levert den."
          : "Bekreft når du har den."
      }`,
      open: words.open,
    };
  }

  return {
    tag: dueToday
      ? { text: "Frist i dag", tone: "attention", icon: "calendar" }
      : { text: "Venter på deg", tone: "attention", icon: "attention" },
    // A request's days stand on their own line, in full.
    title: words.about(asked ? { ...item, period: null } : item),
    hint: asked
      ? formatPeriodSentence(asked) + deadline(item)
      : deadline(item).trim() || null,
    open: words.open,
  };
}

/** «Lørdag 10. til mandag 12. oktober». */
function formatPeriodSentence(period: { start: string; end: string }) {
  const text =
    period.start === period.end
      ? formatDay(period.start)
      : `${formatDay(period.start)} til ${formatDay(period.end)}`;

  return text.charAt(0).toLocaleUpperCase("nb") + text.slice(1);
}

/** Tasks of one kind, many at once: «Svar på 3 forespørsler». */
export function groupAction(kind: HomeItemKind, count: number): string | null {
  return tasks[kind as AwaitingKind]?.many?.(count) ?? null;
}

const list = new Intl.ListFormat("nb", { type: "conjunction" });

/** What a group holds: «Stige, sykkelstativ og hekksaks». */
export function groupAbout(items: readonly HomeItem[]): string {
  const titles = items.map((item) => item.title ?? "en ting");
  const text = list.format(titles);

  return text.charAt(0).toLocaleUpperCase("nb") + text.slice(1);
}

/** A handover or return to come, as one line (UX-IA-017). */
export function upcomingText(item: HomeItem): string {
  if (item.kind === "loan.handover") {
    return lending(item)
      ? `${Them(item)} henter ${thing(item)}`
      : `Du henter ${thing(item)} hos ${them(item)}`;
  }

  return lending(item)
    ? `${Them(item)} leverer ${thing(item)} tilbake`
    : `Du leverer ${thing(item)} tilbake til ${them(item)}`;
}

/** The context of a loan: «Lån via Borettslaget Lia». */
export const loanContext = (item: HomeItem) =>
  item.via ? `Lån via ${item.via}` : null;

const weekday = new Intl.DateTimeFormat("nb-NO", {
  weekday: "short",
  timeZone: "UTC",
});

/** A day as a small calendar leaf: «ONS» over «14», or «I DAG». */
export function dayLeaf(day: string, today: string) {
  const date = new Date(`${day}T00:00:00Z`);

  return {
    weekday: day === today ? "I dag" : weekday.format(date).replace(".", ""),
    day: String(date.getUTCDate()),
    label: day === today ? `I dag, ${formatDay(day)}` : formatDay(day),
  };
}

/**
 * Something unsettled that waits for someone else (UX-IA-016): who it
 * waits for, what it is, and where it stands. «Forsinket» only when the
 * borrower is known to have the thing.
 */
export function unresolvedText(item: HomeItem): {
  tag: { text: string; tone: Tone; icon: IconName };
  title: string;
  detail: string | null;
} {
  const waitingFor = {
    text: item.person ? `Venter på ${item.person}` : "Venter på svar",
    tone: "waiting" as const,
    icon: "clock" as const,
  };

  switch (item.kind) {
    case "loan.awaiting_handover":
      return {
        tag: waitingFor,
        title: `Overleveringen av ${thing(item)} avklares`,
        detail: `Du har svart. ${Them(item)} har ikke svart ennå.`,
      };
    case "loan.awaiting_return":
      return {
        tag: waitingFor,
        title: `Returen av ${thing(item)} avklares`,
        detail: `Du har svart. ${Them(item)} har ikke svart ennå.`,
      };
    case "loan.late":
      return {
        tag: { text: "Forsinket", tone: "warning", icon: "clock" },
        title: lending(item)
          ? `${thing(item)} er fortsatt hos ${them(item)}`
          : `Du har fortsatt ${thing(item)}`,
        detail: item.day ? `Skulle vært levert ${formatDay(item.day)}.` : null,
      };
    case "loan.mediation":
      return {
        tag: {
          text: "Venter på administratorene",
          tone: "waiting",
          icon: "shield",
        },
        title: `Lånet av ${thing(item)} er uavklart`,
        detail: item.via
          ? `${item.via} ser på det dere har sagt.`
          : "Miljøet ser på det dere har sagt.",
      };
    default:
      return {
        tag: { text: "Uavklart", tone: "warning", icon: "warning" },
        title: `Dere har sagt ulike ting om ${thing(item)}`,
        detail: "Se lånet for hva dere har sagt, og avklar det sammen.",
      };
  }
}

/** An administrator's task, counted: «Behandle 2 innmeldinger». */
export function administrationText(item: HomeItem): string {
  const count = item.count ?? 1;

  switch (item.kind) {
    case "environment.review_memberships":
      return `Behandle ${count} ${plural(count, "innmelding", "innmeldinger")}`;
    case "environment.review_publications":
      return `Vurder ${count} ting`;
    case "environment.handle_cases":
      return `Svar på ${count} ${plural(count, "henvendelse", "henvendelser")}`;
    default:
      return "Ta over som eier";
  }
}

/** How many tasks of one kind make a group (UX-IA-018). */
export const groupFrom = 3;

export type AwaitingEntry =
  | { readonly type: "card" | "row"; readonly item: HomeItem }
  | {
      readonly type: "group";
      readonly kind: HomeItemKind;
      readonly items: readonly HomeItem[];
    };

/**
 * «Venter på deg» in reading order (UX-IA-018): the full cards first, in
 * Home's order, then one row per task, where many of a kind that can be
 * grouped share one row in the place of the first of them.
 */
export function arrangeAwaiting(
  items: readonly HomeItem[],
  today: string,
): AwaitingEntry[] {
  const alone = items.length === 1;
  const cards = items.filter((item) => isCard(item, today, alone));
  const rows = items.filter((item) => !cards.includes(item));
  const sameKind = (kind: HomeItemKind) =>
    rows.filter((item) => item.kind === kind);
  const grouped = (kind: HomeItemKind) =>
    groupAction(kind, 0) !== null && sameKind(kind).length >= groupFrom;
  const entries: AwaitingEntry[] = cards.map((item) => ({
    type: "card",
    item,
  }));

  for (const item of rows) {
    if (!grouped(item.kind)) {
      entries.push({ type: "row", item });
    } else if (sameKind(item.kind)[0] === item) {
      entries.push({
        type: "group",
        kind: item.kind,
        items: sameKind(item.kind),
      });
    }
  }

  return entries;
}

/**
 * «Som administrator» (UX-JRN-012): the tasks by environment, in the order
 * their environments first appear, and how many there are in all.
 */
export function administrationByEnvironment(items: readonly HomeItem[]) {
  const environments = new Map<
    string,
    { id: string; name: string; items: HomeItem[] }
  >();

  for (const item of items) {
    const environment = environments.get(item.target.id) ?? {
      id: item.target.id,
      name: item.title ?? "",
      items: [],
    };

    environment.items.push(item);
    environments.set(item.target.id, environment);
  }

  return {
    total: items.reduce((sum, item) => sum + (item.count ?? 1), 0),
    environments: [...environments.values()],
  };
}
