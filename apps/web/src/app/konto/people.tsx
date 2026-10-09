import type { SocialContact } from "@lanbort/contracts";
import type { ReactNode } from "react";
import { PersonName } from "@/components/person-name";

/** People in the account's lists, each with what can be done about them. */
export function People({
  heading,
  people,
  actions,
}: {
  heading: string;
  people: readonly SocialContact[];
  /** What can be done about each person, if anything. */
  actions?: (person: SocialContact) => ReactNode;
}) {
  if (people.length === 0) return null;

  return (
    <section>
      <h2>
        {heading} · {people.length}
      </h2>
      <ul className="entries">
        {people.map((person) => {
          const buttons = actions?.(person);

          return (
            <li key={person.userId} className="entry">
              <strong id={`person-${person.userId}`}>
                <PersonName person={person} />
              </strong>
              {/* The buttons are named with the person they are about. */}
              {buttons && (
                <div
                  className="actions"
                  role="group"
                  aria-labelledby={`person-${person.userId}`}
                >
                  {buttons}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the person is asked about: the same for every relation step. */
export const target = (person: SocialContact) => ({ userId: person.userId });
