import type {
  AddableObjectList,
  Environment,
  EnvironmentObject,
  EnvironmentObjectList,
  ObjectSearchResult,
} from "@lanbort/contracts";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ownersDetail } from "@/components/owner-names";
import { Tag } from "@/components/tag";
import { ThingCard, ThingCards } from "@/components/thing-card";
import {
  environmentHref,
  newObjectHref,
  objectHref,
} from "@/navigation/routes";
import {
  environmentImageHref,
  firstImageHref,
  ownImageHref,
} from "@/presentation/object-images";
import { availabilityStatus } from "@/presentation/objects";
import { AddThings } from "./add-things";

/**
 * The things an active member finds in the environment (PS-OBJ-006), each
 * leading to the thing as seen here, with its owners who are members here
 * (PS-ENV-015), and the ways to put more things here (`ThingActions`).
 */
export function Things({
  environment,
  things,
  addable,
  today,
  nextHref,
  paged,
}: {
  environment: Environment;
  things: EnvironmentObjectList;
  addable: AddableObjectList | null;
  today: string;
  nextHref: (cursor: string) => string;
  /** Not the first page: offer the way back to it. */
  paged: boolean;
}) {
  return (
    <section aria-labelledby="ting">
      <h2 id="ting">Ting i miljøet</h2>
      {things.objects.length === 0 ? (
        <EmptyState
          action={
            <ThingActions environment={environment} addable={addable} primary />
          }
        >
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
          <ThingActions environment={environment} addable={addable} />
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

/**
 * The two ways to put things here while the environment takes them
 * (Tomat): registering a new one with the environment preselected
 * (UX-JRN-003), and adding things the user already has, when there are
 * any that can be added (`AddThings`).
 */
function ThingActions({
  environment,
  addable,
  primary = false,
}: {
  environment: Environment;
  addable: AddableObjectList | null;
  primary?: boolean;
}) {
  if (environment.state !== "active") return null;

  const things = (addable?.objects ?? []).map(
    ({ objectId, title, images }) => ({
      objectId,
      title,
      image: firstImageHref(images, (imageId) =>
        ownImageHref(objectId, imageId),
      ),
    }),
  );

  return (
    <div className="actions">
      <Link
        className={`button ${primary ? "button-primary" : "button-secondary"}`}
        href={newObjectHref(environment.id)}
      >
        <Icon name="plus" /> Registrer en ny ting
      </Link>
      {things.length > 0 && (
        <AddThings
          environmentId={environment.id}
          environmentName={environment.name}
          approval={environment.requiresObjectApproval}
          things={things}
        />
      )}
    </div>
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
