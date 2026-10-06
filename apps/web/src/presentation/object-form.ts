import type {
  AvailabilityInterval,
  CreateObject,
  ObjectChangeField,
  OwnObject,
} from "@lanbort/contracts";

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
  title: "Tittel",
  categoryId: "Kategori",
  description: "Beskrivelse",
  loanTerms: "Vilkår for lån",
  availability: "Når den kan lånes",
};

/**
 * PS-LOAN-005, OD-0014: until it is decided which changes matter, every
 * change to the terms asks whoever waits for an answer to confirm them.
 */
export const changedTermsNotice =
  "Når du endrer vilkårene, må de som har sendt en forespørsel som venter på svar, godta de nye vilkårene før forespørselen kan godkjennes.";
