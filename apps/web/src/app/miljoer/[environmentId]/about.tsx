import type { Environment, Requirement } from "@lanbort/contracts";
import { Fragment } from "react";
import { AreaMap } from "@/components/area-map";
import {
  describeMembers,
  environmentTypeExplanations,
  requirementKindNames,
} from "@/presentation/environments";
import styles from "./environment.module.css";

/**
 * What the environment is, as far as the caller may see it (PS-ENV-001):
 * the type in plain words, who and what it is for, about how many members
 * it has (PS-ENV-016) and where it is, approximately (WP-62).
 */
export function About({ environment }: { environment: Environment }) {
  const { description, audience, objectFocus, members, location, area } =
    environment;

  return (
    <section aria-labelledby="om-miljoet" className={styles.card}>
      <h2 id="om-miljoet">Om miljøet</h2>
      <dl className="facts">
        <dt>Type</dt>
        <dd>{environmentTypeExplanations[environment.type]}</dd>
        {description && (
          <>
            <dt>Beskrivelse</dt>
            <dd className="message-text">{description}</dd>
          </>
        )}
        {audience && (
          <>
            <dt>For hvem</dt>
            <dd className="message-text">{audience}</dd>
          </>
        )}
        {objectFocus && (
          <>
            <dt>Hva slags ting</dt>
            <dd className="message-text">{objectFocus}</dd>
          </>
        )}
        {members && (
          <>
            <dt>Medlemmer</dt>
            <dd>{describeMembers(members)}</dd>
          </>
        )}
        {location && (
          <>
            <dt>Sted</dt>
            <dd>{location}</dd>
          </>
        )}
        {area && (
          <>
            <dt>Område</dt>
            <dd>Omtrent {area.radiusKm} km rundt et punkt på kartet</dd>
          </>
        )}
      </dl>
      <EnvironmentArea environment={environment} />
    </section>
  );
}

/** The environment's approximate area on a map, if it has one (WP-62). */
export function EnvironmentArea({
  environment: { id, name, area },
}: {
  environment: Environment;
}) {
  return (
    area && (
      <AreaMap
        areas={[{ id, name, area }]}
        searched={null}
        caption="Omtrentlig område for miljøet."
      />
    )
  );
}

/**
 * The rules and requirements members have met (PS-ENV-005), or, before
 * joining, what joining asks (UX-JRN-002).
 */
export function Requirements({
  requirements,
  heading = "Regler og krav",
}: {
  requirements: readonly Requirement[];
  heading?: string;
}) {
  if (requirements.length === 0) return null;

  return (
    <section aria-labelledby="krav" className={styles.card}>
      <h2 id="krav">{heading}</h2>
      <dl className="facts">
        {requirements.map(({ id, kind, text }) => (
          <Fragment key={id}>
            <dt>{requirementKindNames[kind]}</dt>
            <dd className="message-text">{text}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

/** What joining gives, said before it (Tomat kjerneflyt 3). */
export function MembersOnly() {
  return (
    <section aria-labelledby="bare-medlemmer" className={styles.card}>
      <h2 id="bare-medlemmer">Bare for medlemmer</h2>
      <p>Tingene i miljøet, hvem som eier dem, og hvem som er med.</p>
    </section>
  );
}
