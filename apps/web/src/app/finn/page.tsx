import type { ObjectCategory } from "@lanbort/contracts";
import {
  calendarDate,
  listObjectCategories,
  RateLimitedError,
  searchEnvironments,
  searchObjects,
  takesNewActivity,
} from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AreaMap } from "@/components/area-map";
import { errorMessage } from "@/components/error-messages";
import { EntryDetail } from "@/components/entry-detail";
import { ErrorText } from "@/components/error-text";
import { NearMeButton } from "@/components/near-me-button";
import { ownersDetail } from "@/components/owner-names";
import {
  defaultDistanceKm,
  distanceOptions,
  type Location,
  locate,
} from "@/presentation/places";
import {
  environmentHref,
  newEnvironmentHref,
  objectHref,
} from "@/navigation/routes";
import { describeAvailability } from "@/presentation/objects";
import {
  describeFoundIn,
  environmentTypeLabels,
  type FinnForm,
  finnHref,
  foundOrigin,
  membershipLabels,
  type Prepared,
  prepareEnvironmentSearch,
  prepareObjectSearch,
  readFinnForm,
} from "@/presentation/search";
import { placeSearchFor } from "@/server/places";
import { pageQuery, requirePageAccount } from "@/server/session";
import styles from "./finn.module.css";

export const metadata: Metadata = { title: "Finn – Lånbort" };

const tabs = [
  { tab: "objects", href: "/finn", label: "Ting" },
  { tab: "environments", href: "/finn?vis=miljoer", label: "Miljøer" },
] as const;

/**
 * Finn (UX-IA-001, UX-P20): targeted search for things in the user's own
 * environments and for environments to join. Nothing is listed until the
 * user asks for something, and the search itself decides what each user may
 * find (WP-61, ADR-0005). Both can be near a place (WP-62).
 */
export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requirePageAccount();

  if (!takesNewActivity(account.status)) {
    // Finding leads to something new, which an account at rest does not
    // start (PS-ADM-002); the server refuses to search for it as well.
    return (
      <main>
        <h1>Finn</h1>
        <p className="quiet">
          Du kan ikke finne nye ting mens kontoen ikke er aktiv.
        </p>
      </main>
    );
  }

  const form = readFinnForm(await searchParams);

  return (
    <main>
      <h1>Finn</h1>
      <nav aria-label="Hva du leter etter" className="filters">
        {tabs.map(({ tab, href, label }) => (
          <a
            key={tab}
            href={href}
            aria-current={tab === form.tab ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {form.tab === "objects" ? (
        <ObjectSearch form={form} userId={account.userId} />
      ) : (
        <EnvironmentSearch form={form} userId={account.userId} />
      )}
    </main>
  );
}

interface Searched<I, O> {
  readonly prepared: Prepared<I>;
  readonly location: Location | undefined;
  readonly result: O | null;
}

/**
 * The place a search is near, or the problem with it, before anything else;
 * then the search itself. Too many searches in a row (WP-73) is a problem
 * to show like any other, with nothing found.
 */
async function searched<I, O>(
  form: FinnForm,
  userId: string,
  prepare: (near: Location["near"] | undefined) => Prepared<I>,
  search: (input: I) => Promise<O | null>,
): Promise<Searched<I, O>> {
  try {
    const place = await locate(form, placeSearchFor(userId));

    if (place && "problem" in place) {
      return { prepared: place, location: undefined, result: null };
    }

    const prepared = prepare(place?.location.near);

    return {
      prepared,
      location: place?.location,
      result:
        prepared && "input" in prepared ? await search(prepared.input) : null,
    };
  } catch (error) {
    if (!(error instanceof RateLimitedError)) throw error;

    return {
      prepared: { problem: errorMessage("rate_limited") },
      location: undefined,
      result: null,
    };
  }
}

async function ObjectSearch({
  form,
  userId,
}: {
  form: FinnForm;
  userId: string;
}) {
  const [categories, { location, prepared, result }] = await Promise.all([
    pageQuery(listObjectCategories, {}),
    searched(
      form,
      userId,
      (near) => prepareObjectSearch(form, near),
      (input) => pageQuery(searchObjects, input),
    ),
  ]);
  const labels = new Map(
    (categories?.categories ?? []).map((category) => [
      category.id,
      category.label,
    ]),
  );
  const today = calendarDate(new Date());

  return (
    <>
      <form role="search" action="/finn" method="get">
        <label htmlFor="finn-q">Hva leter du etter?</label>
        <input
          id="finn-q"
          name="q"
          type="search"
          defaultValue={form.q}
          maxLength={100}
          autoComplete="off"
        />
        <label htmlFor="finn-kategori">Kategori</label>
        <select id="finn-kategori" name="kategori" defaultValue={form.category}>
          <option value="">Alle kategorier</option>
          {orderedCategories(categories?.categories ?? []).map(
            ({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {`${"– ".repeat(depth)}${category.label}`}
              </option>
            ),
          )}
        </select>
        <fieldset>
          <legend>Ledig hele perioden (valgfritt)</legend>
          <label htmlFor="finn-fra">Første dag</label>
          <input
            id="finn-fra"
            name="fra"
            type="date"
            defaultValue={form.from}
          />
          <label htmlFor="finn-til">Siste dag</label>
          <input id="finn-til" name="til" type="date" defaultValue={form.to} />
        </fieldset>
        <PlaceFields form={form} legend="I miljøer nær et sted (valgfritt)" />
        <button type="submit">Søk</button>
      </form>
      <Results
        prepared={prepared}
        location={location}
        form={form}
        count={result?.objects.length ?? 0}
        more={result?.more ?? false}
        empty="Ingen ting i miljøene dine passer med søket."
        hint="Søk etter ting i miljøene du er medlem av, med ord eller kategori."
      >
        {result?.objects.map((object) => (
          <li key={object.objectId} className="entry">
            <strong>
              <Link href={objectHref(object.objectId, foundOrigin(object))}>
                {object.title}
              </Link>
            </strong>
            <EntryDetail
              parts={[
                labels.get(object.categoryId),
                describeFoundIn(object),
                object.ownedByYou ? "Din ting" : ownersDetail(object.owners),
              ]}
            />
            <span>{describeAvailability(object, today)}</span>
          </li>
        ))}
      </Results>
    </>
  );
}

async function EnvironmentSearch({
  form,
  userId,
}: {
  form: FinnForm;
  userId: string;
}) {
  const { location, prepared, result } = await searched(
    form,
    userId,
    (near) => prepareEnvironmentSearch(form, near),
    (input) => pageQuery(searchEnvironments, input),
  );

  return (
    <>
      <form role="search" action="/finn" method="get">
        <input type="hidden" name="vis" value="miljoer" />
        <label htmlFor="finn-q">Navn, sted eller hva miljøet handler om</label>
        <input
          id="finn-q"
          name="q"
          type="search"
          defaultValue={form.q}
          maxLength={100}
          autoComplete="off"
        />
        <label htmlFor="finn-type">Type</label>
        <select id="finn-type" name="type" defaultValue={form.type}>
          <option value="">Åpne og lukkede</option>
          <option value="open">Åpne</option>
          <option value="closed">Lukkede</option>
        </select>
        <PlaceFields form={form} legend="Nær et sted (valgfritt)" />
        <button type="submit">Søk</button>
      </form>
      <Results
        prepared={prepared}
        location={location}
        form={form}
        count={result?.environments.length ?? 0}
        more={result?.more ?? false}
        empty="Ingen miljøer passer med søket."
        hint="Finn åpne og lukkede miljøer du kan bli med i, etter navn, tema eller sted."
        map={
          result && (
            <AreaMap
              areas={result.environments.flatMap(({ id, name, area }) =>
                area ? [{ id, name, area }] : [],
              )}
              searched={location?.near ?? null}
            />
          )
        }
      >
        {result?.environments.map((environment) => (
          <li key={environment.id} className="entry">
            <Link href={environmentHref(environment.id)}>
              <strong>{environment.name}</strong>
            </Link>
            <EntryDetail
              parts={[
                environmentTypeLabels[environment.type],
                environment.location,
              ]}
            />
            {environment.description && <span>{environment.description}</span>}
            {environment.membershipState && (
              <span className="waiting">
                {membershipLabels[environment.membershipState]}
              </span>
            )}
          </li>
        ))}
      </Results>
      <p className="link-row">
        <Link href={newEnvironmentHref}>Opprett et miljø</Link>
      </p>
    </>
  );
}

/**
 * Where to search near (WP-62): a place in words, or where the user is,
 * and how far around it. A place already chosen stays chosen while its
 * name is unchanged.
 */
function PlaceFields({ form, legend }: { form: FinnForm; legend: string }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <label htmlFor="finn-sted">Sted</label>
      <input
        id="finn-sted"
        name="sted"
        type="search"
        defaultValue={form.place}
        maxLength={100}
        autoComplete="off"
      />
      <label htmlFor="finn-avstand">Avstand</label>
      <select
        id="finn-avstand"
        name="avstand"
        defaultValue={form.distance || String(defaultDistanceKm)}
      >
        {distanceOptions.map((km) => (
          <option key={km} value={km}>
            {`Innen ${km} km`}
          </option>
        ))}
      </select>
      {form.point && (
        <>
          <input type="hidden" name="punkt" value={form.point} />
          <input type="hidden" name="punktsted" value={form.place} />
        </>
      )}
      <NearMeButton />
    </fieldset>
  );
}

/** Which place the search was near, and the others with that name. */
function LocationNote({
  form,
  location,
}: {
  form: FinnForm;
  location: Location;
}) {
  return (
    <>
      <p>{`Nær ${location.label}, innen ${location.near.radiusKm} km.`}</p>
      {location.alternatives.length > 0 && (
        <nav aria-label="Andre steder med samme navn">
          <p className="quiet">Mente du et annet sted?</p>
          <ul className={`${styles.alternatives} link-row`}>
            {location.alternatives.map((choice) => (
              <li key={choice.point}>
                <a
                  href={finnHref(form, {
                    place: choice.name,
                    point: choice.point,
                  })}
                >
                  {choice.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}

/** The answer to a search, or why there is none (UX-P21). */
function Results({
  prepared,
  location,
  form,
  count,
  more,
  empty,
  hint,
  map,
  children,
}: {
  prepared: Prepared<unknown>;
  location: Location | undefined;
  form: FinnForm;
  count: number;
  more: boolean;
  empty: string;
  hint: string;
  map?: ReactNode;
  children: ReactNode;
}) {
  if (!prepared) {
    return <p className="quiet">{hint}</p>;
  }

  if ("problem" in prepared) {
    return <ErrorText>{prepared.problem}</ErrorText>;
  }

  return (
    <section aria-labelledby="treff" className={styles.results}>
      <h2 id="treff">Treff</h2>
      {location && <LocationNote form={form} location={location} />}
      {count === 0 ? (
        <p className="quiet">{empty}</p>
      ) : (
        <ul className="entries">{children}</ul>
      )}
      {more && (
        <p className="quiet">
          Viser de beste treffene. Gjør søket mer presist for å finne flere.
        </p>
      )}
      {map}
    </section>
  );
}

/** Each category followed by those below it, for the list to choose from. */
function orderedCategories(
  categories: readonly ObjectCategory[],
  parentId: string | null = null,
  depth = 0,
): { category: ObjectCategory; depth: number }[] {
  return categories
    .filter((category) => category.parentId === parentId)
    .flatMap((category) => [
      { category, depth },
      ...orderedCategories(categories, category.id, depth + 1),
    ]);
}
