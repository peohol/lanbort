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
import { SearchField } from "@/components/search-field";
import { ContextTag, Tag } from "@/components/tag";
import { ThingCard, ThingCards } from "@/components/thing-card";
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
import { describeMembers } from "@/presentation/environments";
import { availabilityStatus } from "@/presentation/objects";
import {
  describeFoundIn,
  foundImage,
  type FinnForm,
  finnHref,
  foundOrigin,
  joiningExplained,
  joiningLabels,
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
    <main className={styles.finn}>
      <h1>Finn</h1>
      <nav aria-label="Hva du leter etter" className={styles.segments}>
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
      <form role="search" action="/finn" method="get" className={styles.form}>
        <SearchField
          id="finn-q"
          label="Hva leter du etter?"
          defaultValue={form.q}
        />
        <MoreFilters
          chosen={Boolean(
            form.category || form.from || form.to || placeChosen(form),
          )}
        >
          <label htmlFor="finn-kategori">Kategori</label>
          <select
            id="finn-kategori"
            name="kategori"
            defaultValue={form.category}
          >
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
            <input
              id="finn-til"
              name="til"
              type="date"
              defaultValue={form.to}
            />
          </fieldset>
          <PlaceFields form={form} legend="I miljøer nær et sted (valgfritt)" />
        </MoreFilters>
      </form>
      <Results
        prepared={prepared}
        location={location}
        form={form}
        count={result?.objects.length ?? 0}
        counted={(count) => `${count} ting`}
        more={result?.more ?? false}
        empty="Ingen ting i miljøene dine passer med søket."
        hint="Søk etter ting i miljøene du er medlem av, med ord eller kategori."
      >
        <ThingCards>
          {result?.objects.map((object) => {
            const status = availabilityStatus(object, today);

            return (
              <ThingCard
                key={object.objectId}
                href={objectHref(object.objectId, foundOrigin(object))}
                title={object.title}
                image={foundImage(object)}
                details={[
                  <EntryDetail
                    key="who"
                    parts={[
                      object.ownedByYou
                        ? "Din ting"
                        : ownersDetail(object.owners),
                      labels.get(object.categoryId),
                    ]}
                  />,
                  ...describeFoundIn(object).map(({ icon, text }) => (
                    <ContextTag key={icon} label="Kontekst" icon={icon}>
                      {text}
                    </ContextTag>
                  )),
                ]}
                status={<Tag tone={status.tone}>{status.label}</Tag>}
              />
            );
          })}
        </ThingCards>
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
      <form role="search" action="/finn" method="get" className={styles.form}>
        <input type="hidden" name="vis" value="miljoer" />
        <SearchField
          id="finn-q"
          label="Navn, sted eller hva miljøet handler om"
          defaultValue={form.q}
        />
        <MoreFilters chosen={Boolean(form.type) || placeChosen(form)}>
          <label htmlFor="finn-type">Type</label>
          <select id="finn-type" name="type" defaultValue={form.type}>
            <option value="">Åpne og lukkede</option>
            <option value="open">Åpne</option>
            <option value="closed">Lukkede</option>
          </select>
          <PlaceFields form={form} legend="Nær et sted (valgfritt)" />
        </MoreFilters>
      </form>
      <Results
        prepared={prepared}
        location={location}
        form={form}
        count={result?.environments.length ?? 0}
        counted={(count) => (count === 1 ? "1 miljø" : `${count} miljøer`)}
        more={result?.more ?? false}
        empty="Ingen miljøer passer med søket. Prøv et stedsnavn, et borettslag eller en forening. Du kan også starte et miljø selv."
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
        <ul className={styles.results}>
          {result?.environments.map((environment) => (
            <li key={environment.id} className={styles.result}>
              <Link
                className={styles.name}
                href={environmentHref(environment.id)}
              >
                {environment.name}
              </Link>
              <ContextTag label="Sted og størrelse" icon="environment">
                {[environment.location, describeMembers(environment.members)]
                  .filter(Boolean)
                  .join(" · ")}
              </ContextTag>
              {environment.description && (
                <span className={styles.description}>
                  {environment.description}
                </span>
              )}
              {environment.membershipState ? (
                <Tag
                  tone={
                    environment.membershipState === "active"
                      ? "positive"
                      : "waiting"
                  }
                >
                  {membershipLabels[environment.membershipState]}
                </Tag>
              ) : (
                <Tag icon={environment.type === "open" ? "people" : "lock"}>
                  {joiningLabels[environment.type]}
                </Tag>
              )}
            </li>
          ))}
        </ul>
      </Results>
      <details className={styles.explained}>
        <summary>Hva betyr åpent og lukket?</summary>
        <ul>
          {joiningExplained.map(({ name, text }) => (
            <li key={name}>
              <strong>{name}</strong> {text}
            </li>
          ))}
        </ul>
        <p>I alle miljøene ser bare medlemmer tingene og hvem som er med.</p>
      </details>
      <p className="link-row">
        <Link href={newEnvironmentHref}>Opprett et miljø</Link>
      </p>
    </>
  );
}

/** A place to search near, named or where the user is («Bruk der jeg er»). */
const placeChosen = ({ place, point }: FinnForm) => Boolean(place || point);

/** The rest of the search, folded away until it is used. */
function MoreFilters({
  chosen,
  children,
}: {
  chosen: boolean;
  children: ReactNode;
}) {
  return (
    <details className={styles.more} open={chosen}>
      <summary>Avgrens søket</summary>
      <div className={styles.fields}>{children}</div>
    </details>
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
  counted,
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
  /** The count in words, as the heading of the results. */
  counted: (count: number) => string;
  more: boolean;
  empty: string;
  hint: string;
  map?: ReactNode;
  /** The list of what was found. */
  children: ReactNode;
}) {
  if (!prepared) {
    return <p className="quiet">{hint}</p>;
  }

  if ("problem" in prepared) {
    return <ErrorText>{prepared.problem}</ErrorText>;
  }

  return (
    <section aria-label="Treff" className={styles.found}>
      <h2 className={styles.count}>
        {count === 0 ? "Ingen treff" : counted(count)}
      </h2>
      {location && <LocationNote form={form} location={location} />}
      {count === 0 ? <p className="quiet">{empty}</p> : children}
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
