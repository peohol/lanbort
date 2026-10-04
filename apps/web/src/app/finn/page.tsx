import type { ObjectCategory } from "@lanbort/contracts";
import {
  calendarDate,
  listObjectCategories,
  searchEnvironments,
  searchObjects,
} from "@lanbort/domain";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  describeAvailability,
  describeFoundIn,
  environmentTypeLabels,
  type FinnForm,
  membershipLabels,
  type Prepared,
  prepareEnvironmentSearch,
  prepareObjectSearch,
  readFinnForm,
} from "@/presentation/search";
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
 * find (WP-61, ADR-0005).
 */
export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccount();
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
        <ObjectSearch form={form} />
      ) : (
        <EnvironmentSearch form={form} />
      )}
    </main>
  );
}

async function ObjectSearch({ form }: { form: FinnForm }) {
  const prepared = prepareObjectSearch(form);
  const [categories, result] = await Promise.all([
    pageQuery(listObjectCategories, {}),
    prepared && "input" in prepared
      ? pageQuery(searchObjects, prepared.input)
      : null,
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
        <select
          id="finn-kategori"
          name="kategori"
          defaultValue={form.category}
          className={styles.select}
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
          <input id="finn-til" name="til" type="date" defaultValue={form.to} />
        </fieldset>
        <button type="submit">Søk</button>
      </form>
      <Results
        prepared={prepared}
        count={result?.objects.length ?? 0}
        more={result?.more ?? false}
        empty="Ingen ting i miljøene dine passer med søket."
        hint="Søk etter ting i miljøene du er medlem av, med ord eller kategori."
      >
        {result?.objects.map((object) => (
          <li key={object.objectId} className="entry">
            <strong>{object.title}</strong>
            <span className="entry-detail">
              {[
                labels.get(object.categoryId),
                describeFoundIn(object),
                object.ownedByYou ? "Din ting" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span>{describeAvailability(object, today)}</span>
          </li>
        ))}
      </Results>
    </>
  );
}

async function EnvironmentSearch({ form }: { form: FinnForm }) {
  const prepared = prepareEnvironmentSearch(form);
  const result =
    prepared && "input" in prepared
      ? await pageQuery(searchEnvironments, prepared.input)
      : null;

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
        <select
          id="finn-type"
          name="type"
          defaultValue={form.type}
          className={styles.select}
        >
          <option value="">Åpne og lukkede</option>
          <option value="open">Åpne</option>
          <option value="closed">Lukkede</option>
        </select>
        <button type="submit">Søk</button>
      </form>
      <Results
        prepared={prepared}
        count={result?.environments.length ?? 0}
        more={result?.more ?? false}
        empty="Ingen miljøer passer med søket."
        hint="Finn åpne og lukkede miljøer du kan bli med i."
      >
        {result?.environments.map((environment) => (
          <li key={environment.id} className="entry">
            <strong>{environment.name}</strong>
            <span className="entry-detail">
              {[environmentTypeLabels[environment.type], environment.location]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {environment.description && <span>{environment.description}</span>}
            {environment.membershipState && (
              <span className="waiting">
                {membershipLabels[environment.membershipState]}
              </span>
            )}
          </li>
        ))}
      </Results>
    </>
  );
}

/** The answer to a search, or why there is none (UX-P21). */
function Results({
  prepared,
  count,
  more,
  empty,
  hint,
  children,
}: {
  prepared: Prepared<unknown>;
  count: number;
  more: boolean;
  empty: string;
  hint: string;
  children: ReactNode;
}) {
  if (!prepared) {
    return <p className="quiet">{hint}</p>;
  }

  if ("problem" in prepared) {
    return (
      <p className="error" role="alert">
        {prepared.problem}
      </p>
    );
  }

  return (
    <section aria-labelledby="treff" className={styles.results}>
      <h2 id="treff">Treff</h2>
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
