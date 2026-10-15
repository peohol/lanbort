import type { EnvironmentMember } from "@lanbort/contracts";
import { Icon } from "@/components/icon";
import { PersonName } from "@/components/person-name";
import { PillList } from "@/components/pill-list";
import { memberGroups } from "@/presentation/environments";
import styles from "./environment.module.css";

/** How many rows of ordinary members show before «Vis alle». */
const memberRows = 3;

/**
 * Who is in the environment (PS-ENV-015, Tomat): the owner, the
 * administrators and the members, each a pill with picture and name that
 * leads to the person's page where the reader may open it (WP-86). The
 * reader is among them. Nothing given to the membership process is shown
 * (UX-PRIV-009).
 */
export function Members({
  others,
  me,
}: {
  /** The other active members the reader may see. */
  others: readonly EnvironmentMember[];
  me: EnvironmentMember;
}) {
  return (
    <section aria-label="Medlemmer" className={styles.members}>
      {memberGroups(others, me).map(({ key, heading, icon, people }) => (
        <div key={key} className={styles.group}>
          <h2 id={`medlemmer-${key}`} className={styles.groupHeading}>
            <Icon name={icon} />
            {heading}
          </h2>
          <PillList
            label={heading}
            rows={key === "members" ? memberRows : undefined}
          >
            {people.map((person) => (
              <li key={person.userId} className={styles.pill}>
                <PersonName person={person} />
              </li>
            ))}
          </PillList>
        </div>
      ))}
    </section>
  );
}
