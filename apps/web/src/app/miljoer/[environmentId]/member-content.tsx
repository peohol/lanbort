import {
  type Environment,
  type EnvironmentMember,
  type EnvironmentObject,
  type EnvironmentObjectList,
  type ObjectCategory,
  type ObjectSearchResult,
  thingListLimit,
} from "@lanbort/contracts";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PersonName } from "@/components/person-name";
import { Tag } from "@/components/tag";
import { FoundThingCard } from "@/components/thing-card";
import { ThingList, type ThingListFilter } from "@/components/thing-list";
import {
  environmentHref,
  newObjectHref,
  objectHref,
} from "@/navigation/routes";
import { roleName } from "@/presentation/environments";
import {
  environmentImageHref,
  firstImageHref,
} from "@/presentation/object-images";
import { filterThings } from "@/presentation/thing-list";

/**
 * The things an active member finds in the environment (PS-OBJ-006), each
 * leading to the thing as seen here, with its owners who are members here
 * (PS-ENV-015), grouped by category and filtered (UX-IA-021). Registering a
 * thing from here preselects the environment (UX-JRN-003).
 */
export function Things({
  environment,
  things,
  categories,
  filter,
  today,
}: {
  environment: Environment;
  things: EnvironmentObjectList;
  categories: readonly ObjectCategory[];
  filter: ThingListFilter;
  today: string;
}) {
  const register = (primary: boolean) =>
    environment.state === "active" ? (
      <Link
        className={`button ${primary ? "button-primary" : "button-secondary"}`}
        href={newObjectHref(environment.id)}
      >
        <Icon name="plus" /> Registrer en ting her
      </Link>
    ) : null;

  return (
    <section aria-labelledby="ting">
      <h2 id="ting">Ting i miljøet</h2>
      {things.objects.length === 0 ? (
        <EmptyState action={register(true)}>
          {`Ingen ting her ennå. Bli den første som legger ut noe i ${environment.name}.`}
        </EmptyState>
      ) : (
        <>
          <EnvironmentThings
            environment={environment}
            things={things.objects}
            categories={categories}
            filter={filter}
            today={today}
          />
          {things.more && (
            <p className="quiet">
              Viser de {thingListLimit} nyeste tingene. Søk for å finne de
              andre.
            </p>
          )}
          {environment.state === "active" && (
            <div className="actions">{register(false)}</div>
          )}
        </>
      )}
    </section>
  );
}

/** Things as the environment shows them, by category. */
function EnvironmentThings({
  environment,
  things,
  categories,
  filter,
  today,
}: {
  environment: Environment;
  things: readonly Omit<EnvironmentObject, "publicationId">[];
  categories: readonly ObjectCategory[];
  filter: ThingListFilter;
  today: string;
}) {
  return (
    <ThingList
      things={things}
      categories={categories}
      today={today}
      filter={filter}
      card={(thing) => (
        <FoundThingCard
          key={thing.objectId}
          thing={thing}
          href={objectHref(thing.objectId, {
            kind: "environment",
            environmentId: environment.id,
          })}
          image={firstImageHref(thing.images, (imageId) =>
            environmentImageHref(environment.id, thing.objectId, imageId),
          )}
          today={today}
        />
      )}
    />
  );
}

/**
 * The things in the environment that match a search (Tomat kjerneflyt 3,
 * «Søk i …»): the best matches as in Finn, by category, with the way back
 * to all of them.
 */
export function FoundThings({
  environment,
  q,
  found,
  categories,
  filter,
  today,
}: {
  environment: Environment;
  q: string;
  found: ObjectSearchResult;
  categories: readonly ObjectCategory[];
  filter: ThingListFilter;
  today: string;
}) {
  const count = found.objects.length;
  // The heading counts what the filter shows.
  const shown = filterThings(found.objects, filter.chosen, today).length;

  return (
    <section aria-labelledby="treff">
      <h2 id="treff">
        {count === 0 ? "Ingen treff" : `${shown} ting`} for «{q}»
      </h2>
      {count === 0 ? (
        <p className="quiet">Ingen ting i miljøet passer med søket.</p>
      ) : (
        <EnvironmentThings
          environment={environment}
          things={found.objects}
          categories={categories}
          filter={filter}
          today={today}
        />
      )}
      {found.more && (
        <p className="quiet">
          Viser de beste treffene. Gjør søket mer presist for å finne flere.
        </p>
      )}
      <p className="link-row">
        <Link href={environmentHref(environment.id)}>Vis alle ting</Link>
      </p>
    </section>
  );
}

/**
 * The other active members (vision 03), each leading to the person's page,
 * where they can become friends (WP-86). Nothing given to the membership
 * process is shown (UX-PRIV-009).
 */
export function Members({
  members,
}: {
  members: readonly EnvironmentMember[];
}) {
  return (
    <section aria-labelledby="medlemmer">
      <h2 id="medlemmer">
        Andre medlemmer <span className="count">({members.length})</span>
      </h2>
      {members.length === 0 ? (
        <p className="quiet">Det er ingen andre medlemmer her ennå.</p>
      ) : (
        <ul className="entries">
          {members.map((member) => {
            const role = roleName(member.roles);

            return (
              <li key={member.userId} className="entry">
                <PersonName person={member} />
                {role && (
                  <span>
                    <Tag>{role}</Tag>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
