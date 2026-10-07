import type { Environment, Requirement } from "@lanbort/contracts";
import { Fragment } from "react";
import { AreaMap } from "@/components/area-map";
import {
  environmentTypeExplanations,
  requirementKindNames,
} from "@/presentation/environments";

/**
 * What the environment is, as far as the caller may see it (PS-ENV-001):
 * the type in plain words, who and what it is for, and where it is,
 * approximately (WP-62).
 */
export function About({ environment }: { environment: Environment }) {
  const { description, audience, objectFocus, location, area } = environment;

  return (
    <section aria-labelledby="om-miljoet">
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
      {area && (
        <AreaMap
          areas={[{ id: environment.id, name: environment.name, area }]}
          searched={null}
        />
      )}
    </section>
  );
}

/** The rules and requirements members have met (PS-ENV-005). */
export function Requirements({
  requirements,
}: {
  requirements: readonly Requirement[];
}) {
  if (requirements.length === 0) return null;

  return (
    <section aria-labelledby="krav">
      <h2 id="krav">Regler og krav</h2>
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
