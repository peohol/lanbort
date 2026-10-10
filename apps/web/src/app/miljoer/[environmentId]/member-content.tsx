import type {
  Environment,
  EnvironmentMember,
  EnvironmentObject,
  EnvironmentObjectList,
  ObjectSearchResult,
} from "@lanbort/contracts";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ownersDetail } from "@/components/owner-names";
import { PersonName } from "@/components/person-name";
import { Tag } from "@/components/tag";
import { ThingCard, ThingCards } from "@/components/thing-card";
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
import { availabilityStatus } from "@/presentation/objects";

/**
 * The things an active member finds in the environment (PS-OBJ-006), each
 * leading to the thing as seen here, with its owners who are members here
 * (PS-ENV-015). Registering a thing from here preselects the environment
 * (UX-JRN-003).
 */
export function Things({
  environment,
  things,
  today,
  nextHref,
  paged,
}: {
  environment: Environment;
  things: EnvironmentObjectList;
  today: string;
  nextHref: (cursor: string) => string;
  /** Not the first page: offer the way back to it. */
  paged: boolean;
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
          {paged
            ? "Ingen flere ting her."
            : `Ingen ting her ennå. Bli den første som legger ut noe i ${environment.name}.`}
        </EmptyState>
      ) : (
        <>
          <ThingCards>
            {things.objects.map((thing) => (
              <EnvironmentThing
                key={thing.publicationId}
                environment={environment}
                thing={thing}
                today={today}
              />
            ))}
          </ThingCards>
          {environment.state === "active" && (
            <div className="actions">{register(false)}</div>
          )}
        </>
      )}
      {(things.nextCursor || paged) && (
        <nav aria-label="Flere ting" className="link-row">
          {paged && (
            <Link href={environmentHref(environment.id)}>Til de nyeste</Link>
          )}{" "}
          {things.nextCursor && (
            <Link href={nextHref(things.nextCursor)}>Vis flere ting</Link>
          )}
        </nav>
      )}
    </section>
  );
}

/** A thing as the environment shows it: its owners here, and whether it is free. */
function EnvironmentThing({
  environment,
  thing,
  today,
}: {
  environment: Environment;
  thing: Omit<EnvironmentObject, "publicationId">;
  today: string;
}) {
  const status = availabilityStatus(thing, today);

  return (
    <ThingCard
      href={objectHref(thing.objectId, {
        kind: "environment",
        environmentId: environment.id,
      })}
      title={thing.title}
      image={firstImageHref(thing.images, (imageId) =>
        environmentImageHref(environment.id, thing.objectId, imageId),
      )}
      details={[thing.ownedByYou ? "Din ting" : ownersDetail(thing.owners)]}
      status={<Tag tone={status.tone}>{status.label}</Tag>}
    />
  );
}

/**
 * The things in the environment that match a search (Tomat kjerneflyt 3,
 * «Søk i …»): the best matches as in Finn, with the way back to all of
 * them.
 */
export function FoundThings({
  environment,
  q,
  found,
  today,
}: {
  environment: Environment;
  q: string;
  found: ObjectSearchResult;
  today: string;
}) {
  const count = found.objects.length;

  return (
    <section aria-labelledby="treff">
      <h2 id="treff">
        {count === 0 ? "Ingen treff" : `${count} ting`} for «{q}»
      </h2>
      {count === 0 ? (
        <p className="quiet">Ingen ting i miljøet passer med søket.</p>
      ) : (
        <ThingCards>
          {found.objects.map((thing) => (
            <EnvironmentThing
              key={thing.objectId}
              environment={environment}
              thing={thing}
              today={today}
            />
          ))}
        </ThingCards>
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
        Medlemmer <span className="count">({members.length})</span>
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
                {role && <Tag>{role}</Tag>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
