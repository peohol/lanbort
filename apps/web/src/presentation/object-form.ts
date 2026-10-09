import type {
  AvailabilityInterval,
  CreateObject,
  ObjectChangeField,
  OwnObject,
} from "@lanbort/contracts";
import { sayList } from "./objects";

/**
 * What the form for a thing holds (UX-JRN-003), as the user types it: text
 * as typed, and each availability period with an empty end for «no end
 * date». The same draft serves registering and editing.
 */
export interface ObjectDraft {
  readonly title: string;
  readonly categoryId: string;
  readonly description: string;
  readonly loanTerms: string;
  readonly availability: readonly DraftInterval[];
}

export interface DraftInterval {
  readonly start: string;
  /** Empty: open, no end date (PS-OBJ-003). */
  readonly end: string;
}

/** A new thing starts available from today on, with no end date. */
export const newDraft = (today: string): ObjectDraft => ({
  title: "",
  categoryId: "",
  description: "",
  loanTerms: "",
  availability: [{ start: today, end: "" }],
});

/** The draft of a thing as it is saved now. */
export const draftOf = (
  object: Pick<OwnObject, ObjectChangeField>,
): ObjectDraft => ({
  title: object.title,
  categoryId: object.categoryId,
  description: object.description,
  loanTerms: object.loanTerms ?? "",
  availability: object.availability.map(({ start, end }) => ({
    start,
    end: end ?? "",
  })),
});

/** The draft as the API takes it: trimmed, no terms as null, open as null. */
export function contentOf(draft: ObjectDraft): CreateObject {
  const loanTerms = draft.loanTerms.trim();

  return {
    title: draft.title.trim(),
    categoryId: draft.categoryId,
    description: draft.description.trim(),
    loanTerms: loanTerms === "" ? null : loanTerms,
    availability: draft.availability.map(
      ({ start, end }): AvailabilityInterval => ({
        start,
        end: end === "" ? null : end,
      }),
    ),
  };
}

const fields: readonly ObjectChangeField[] = [
  "title",
  "categoryId",
  "description",
  "loanTerms",
  "availability",
];

/** The fields where `draft` says something else than `base`. */
export function changedFields(
  base: ObjectDraft,
  draft: ObjectDraft,
): ObjectChangeField[] {
  const before = contentOf(base);
  const after = contentOf(draft);

  return fields.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
  );
}

/**
 * An edit of only what the user changed, based on the version the form
 * shows (PS-OBJ-013): if someone saved in between, the API refuses it.
 */
export function editOf(
  base: ObjectDraft,
  draft: ObjectDraft,
  expectedVersion: number,
): Partial<CreateObject> & { expectedVersion: number } {
  const content = contentOf(draft);

  return Object.fromEntries([
    ["expectedVersion", expectedVersion],
    ...changedFields(base, draft).map((field) => [field, content[field]]),
  ]) as Partial<CreateObject> & { expectedVersion: number };
}

/**
 * The user's changes on top of what someone else saved since the form was
 * opened (PS-OBJ-013): a field the user changed keeps the user's value,
 * every other field takes what is saved now, so keeping one's own changes
 * never undoes someone else's in a field the user did not touch.
 */
export function rebaseDraft(
  base: ObjectDraft,
  saved: ObjectDraft,
  draft: ObjectDraft,
): ObjectDraft {
  const mine = new Set(changedFields(base, draft));

  return Object.fromEntries(
    fields.map((field) => [field, (mine.has(field) ? draft : saved)[field]]),
  ) as unknown as ObjectDraft;
}

/**
 * The periods that share a day with another, by their place in the list.
 * The API refuses those (PS-OBJ-003); periods that only touch are fine,
 * and one without a start yet is not compared.
 */
export function overlappingPeriods(
  periods: readonly DraftInterval[],
): number[] {
  const last = (end: string) => (end === "" ? "9999-12-31" : end);
  const overlapping = new Set<number>();

  periods.forEach((period, index) => {
    periods.forEach((other, otherIndex) => {
      if (
        otherIndex !== index &&
        period.start !== "" &&
        other.start !== "" &&
        period.start <= last(other.end) &&
        other.start <= last(period.end)
      ) {
        overlapping.add(index);
      }
    });
  });

  return [...overlapping].sort((a, b) => a - b);
}

/** Names of the fields in the user's words, as the form shows them. */
export const objectFieldLabels: Record<ObjectChangeField, string> = {
  title: "Navn",
  categoryId: "Kategori",
  description: "Beskrivelse",
  loanTerms: "Vilkår for lånet",
  availability: "Når den kan lånes",
};

/**
 * PS-LOAN-005, OD-0014: until it is decided which changes matter, every
 * change to the terms asks whoever waits for an answer to confirm them.
 */
export const changedTermsNotice =
  "Når du endrer vilkårene, må de som har sendt en forespørsel som venter på svar, godta de nye vilkårene før forespørselen kan godkjennes.";

/**
 * How the thing can be lent (PS-OBJ-003), as the form asks it: from today
 * on with no end, or only in the periods the user gives.
 */
export type AvailabilityMode = "anytime" | "periods";

/** Whether `periods` say «any time»: one open period that has begun. */
export const isAnytime = (
  periods: readonly DraftInterval[],
  today: string,
): boolean =>
  periods.length === 1 &&
  periods[0]!.end === "" &&
  periods[0]!.start !== "" &&
  periods[0]!.start <= today;

/**
 * The steps of the form (UX-JRN-003, UX-IA-013), in order. Registering asks
 * where the thing is shown; editing leaves that to the thing's page.
 */
export const formSteps = {
  create: ["about", "when", "who", "review"],
  edit: ["about", "when", "review"],
} as const;

export type FormStep = (typeof formSteps)[keyof typeof formSteps][number];

/** Each step's name in the step list and on the way back to it. */
export const formStepNames: Record<FormStep, string> = {
  about: "Om tingen",
  when: "Når og vilkår",
  who: "Hvem kan låne",
  review: "Se over",
};

/** Where the user chose to show a new thing (PS-OBJ-006, PS-OBJ-020). */
export interface PublishChoice {
  readonly environments: readonly string[];
  readonly friends: boolean;
}

/**
 * The button that publishes a new thing names where it becomes visible
 * (Tomat kjerneflyt 2); null when nothing is chosen, so it is only saved.
 */
export function publishLabel({
  environments,
  friends,
}: PublishChoice): string | null {
  const places = [
    environments.length === 1
      ? `i ${environments[0]}`
      : environments.length > 1
        ? `i ${environments.length} miljøer`
        : null,
    friends ? "for venner" : null,
  ].filter((place) => place !== null);

  return places.length === 0 ? null : `Publiser ${places.join(" og ")}`;
}

/** Who can find a new thing once it is published, as a sentence. */
export function publishOutcome(
  { environments, friends }: PublishChoice,
  title: string,
): string {
  const who = [
    environments.length > 0 && `medlemmer i ${sayList(environments)}`,
    friends && "vennene dine",
  ].filter(Boolean);

  return `Når du publiserer, kan ${who.join(" og ")} finne ${title} og be om å låne den. Du kan endre alt eller trekke publiseringen tilbake senere.`;
}
