import {
  type EnvironmentSearchQuery,
  environmentSearchQuerySchema,
  type FoundEnvironment,
  type FoundObject,
  type ObjectSearchQuery,
  objectSearchQuerySchema,
} from "@lanbort/contracts";
import { formatDay } from "./dates";

type Params = Record<string, string | string[] | undefined>;

/** What Finn looks for: things, or environments to join (UX-IA-001). */
export type FinnTab = "objects" | "environments";

/** The form as the user filled it in, from the address (`/finn?…`). */
export interface FinnForm {
  readonly tab: FinnTab;
  readonly q: string;
  readonly category: string;
  readonly from: string;
  readonly to: string;
  readonly type: string;
}

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function readFinnForm(params: Params): FinnForm {
  return {
    tab: one(params.vis) === "miljoer" ? "environments" : "objects",
    q: one(params.q),
    category: one(params.kategori),
    from: one(params.fra),
    to: one(params.til),
    type: one(params.type),
  };
}

/**
 * A search to run, a problem to show instead, or nothing yet: Finn only
 * searches when asked something (UX-P20), and explains what to change in
 * words rather than codes.
 */
export type Prepared<I> = { input: I } | { problem: string } | null;

const tooShort = "Skriv minst to tegn.";

export function prepareObjectSearch(
  form: FinnForm,
): Prepared<ObjectSearchQuery> {
  if (!form.q && !form.category) {
    return null;
  }

  const parsed = objectSearchQuerySchema.safeParse({
    q: form.q || undefined,
    categoryId: form.category || undefined,
    availableFrom: form.from || undefined,
    availableTo: form.to || undefined,
  });

  if (parsed.success) {
    return { input: parsed.data };
  }

  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));

  return {
    problem: fields.has("q")
      ? tooShort
      : fields.has("categoryId")
        ? "Velg en kategori fra listen."
        : "Velg både første og siste dag, og en siste dag som ikke er før den første.",
  };
}

export function prepareEnvironmentSearch(
  form: FinnForm,
): Prepared<EnvironmentSearchQuery> {
  if (!form.q) {
    return null;
  }

  const parsed = environmentSearchQuerySchema.safeParse({
    q: form.q,
    type: form.type || undefined,
  });

  return parsed.success ? { input: parsed.data } : { problem: tooShort };
}

/** UX-JRN-002: the type says what joining takes before anyone tries. */
export const environmentTypeLabels: Record<FoundEnvironment["type"], string> = {
  open: "Åpent miljø – alle kan bli med",
  closed: "Lukket miljø – en administrator godkjenner nye medlemmer",
};

export const membershipLabels: Record<
  NonNullable<FoundEnvironment["membershipState"]>,
  string
> = {
  active: "Du er medlem",
  pending: "Medlemskapet ditt venter på avklaring",
  passive: "Du er passivt medlem",
};

/** Whether a found object can be borrowed, without saying what blocks it. */
export function describeAvailability(
  object: FoundObject,
  today: string,
): string {
  const next = object.effectiveAvailability[0];

  if (!object.availableForNewLoans || !next) {
    return "Ikke ledig for nye lån nå";
  }

  return next.start > today ? `Ledig fra ${formatDay(next.start)}` : "Ledig nå";
}

/** Where the user finds it: their own environments, by name. */
export function describeFoundIn(object: FoundObject): string {
  return `I ${object.foundIn.map((place) => place.environmentName).join(", ")}`;
}
