import type { HomeItem, HomeOverview } from "@lanbort/contracts";
import Link from "next/link";
import { hrefFor } from "@/navigation/targets";
import {
  describeHomeItem,
  homeSectionHeadings,
} from "@/presentation/home-items";

const environmentRoles = { owner: "eier", administrator: "administrator" };

function HomeEntry({ item }: { item: HomeItem }) {
  const { text, when } = describeHomeItem(item);
  const href = hrefFor(item.target);

  return (
    <li className="entry">
      {href ? <Link href={href}>{text}</Link> : <span>{text}</span>}
      {when && <span className="entry-detail">{when}</span>}
    </li>
  );
}

/**
 * Home (UX-IA-005): what waits for the user first, then unsettled loans,
 * the next days and administrative tasks; shortcuts to their environments
 * last. Empty sections are left out, so a quiet day shows a quiet Home.
 */
export function HomeView({
  realName,
  home,
}: {
  realName: string;
  home: HomeOverview;
}) {
  const sections = home.sections.filter(({ items }) => items.length > 0);

  return (
    <main>
      <h1>Hei, {realName}</h1>
      {sections.length === 0 && (
        <p className="quiet">Ingenting venter på deg nå.</p>
      )}
      {sections.map(({ section, items }) => (
        <section key={section} aria-labelledby={`hjem-${section}`}>
          <h2 id={`hjem-${section}`}>
            {homeSectionHeadings[section]}{" "}
            <span className="count">({items.length})</span>
          </h2>
          <ul className="entries">
            {items.map((item) => (
              <HomeEntry key={`${item.kind}/${item.target.id}`} item={item} />
            ))}
          </ul>
        </section>
      ))}
      {home.environments.length > 0 && (
        <section aria-labelledby="hjem-miljoer">
          <h2 id="hjem-miljoer">Dine miljøer</h2>
          <ul className="entries">
            {home.environments.map((environment) => (
              <li key={environment.id} className="entry">
                <span>{environment.name}</span>
                {environment.roles.length > 0 && (
                  <span className="entry-detail">
                    Du er{" "}
                    {environment.roles
                      .map((role) => environmentRoles[role])
                      .join(" og ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
