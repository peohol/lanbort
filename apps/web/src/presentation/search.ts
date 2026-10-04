import {
  type EnvironmentSearchQuery,
  environmentSearchQuerySchema,
  type FoundEnvironment,
  type FoundObject,
  type GeoArea,
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
  /** A place named in words (WP-62). */
  readonly place: string;
  /**
   * A point already chosen for the place (`lat,lon`): another of the places
   * with its name, or where the user is. Kept only while the place is the
   * one it was chosen for, so a newly typed place is looked up afresh.
   */
  readonly point: string;
  /** How far around the place, in kilometres. */
  readonly distance: string;
}

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export function readFinnForm(params: Params): FinnForm {
  const place = one(params.sted);

  return {
    tab: one(params.vis) === "miljoer" ? "environments" : "objects",
    q: one(params.q),
    category: one(params.kategori),
    from: one(params.fra),
    to: one(params.til),
    type: one(params.type),
    place,
    point: one(params.punktsted) === place ? one(params.punkt) : "",
    distance: one(params.avstand),
  };
}

/**
 * The address of the form with some fields changed, as the form itself
 * would submit it.
 */
export function finnHref(
  form: FinnForm,
  changes: Partial<Omit<FinnForm, "tab">> = {},
): string {
  const next = { ...form, ...changes };
  const params = new URLSearchParams(
    Object.entries({
      vis: next.tab === "environments" ? "miljoer" : "",
      q: next.q,
      kategori: next.category,
      fra: next.from,
      til: next.to,
      type: next.type,
      sted: next.place,
      avstand: next.distance,
      punkt: next.point,
      punktsted: next.point ? next.place : "",
    }).filter(([, value]) => value !== ""),
  );

  return `/finn?${params}`;
}

/**
 * A search to run, a problem to show instead, or nothing yet: Finn only
 * searches when asked something (UX-P20), and explains what to change in
 * words rather than codes.
 */
export type Prepared<I> = { input: I } | { problem: string } | null;

const tooShort = "Skriv minst to tegn.";

/** A place to search near: things only in environments around it. */
export function prepareObjectSearch(
  form: FinnForm,
  near?: GeoArea,
): Prepared<ObjectSearchQuery> {
  if (!form.q && !form.category) {
    return near
      ? { problem: "Skriv hva du leter etter, eller velg en kategori." }
      : null;
  }

  const parsed = objectSearchQuerySchema.safeParse({
    q: form.q || undefined,
    categoryId: form.category || undefined,
    availableFrom: form.from || undefined,
    availableTo: form.to || undefined,
    ...near,
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

/** Environments by text, by a place to search near, or both. */
export function prepareEnvironmentSearch(
  form: FinnForm,
  near?: GeoArea,
): Prepared<EnvironmentSearchQuery> {
  if (!form.q && !near) {
    return null;
  }

  const parsed = environmentSearchQuerySchema.safeParse({
    q: form.q || undefined,
    type: form.type || undefined,
    ...near,
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
