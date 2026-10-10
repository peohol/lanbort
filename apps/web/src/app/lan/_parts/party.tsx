import Link from "next/link";
import { PersonName } from "@/components/person-name";
import type { PersonRole } from "@/navigation/routes";
import type { ChatContactLink } from "@/server/chat-contact";
import { personName } from "@/presentation/people";
import styles from "./loan.module.css";

const roleLabels: Record<PersonRole, string> = {
  borrower: "Låntaker",
  lender: "Ansvarlig utlåner",
};

/**
 * The other party of the loan (KF7): who they are in it, and the way to
 * their private conversation where the server gives one (KF5 F2–F3): the
 * one they have, or the offer to start it. Their name leads to their page
 * while the reader may open it (UX-PRIV-007).
 */
export function Party({
  person,
  role,
  contact,
}: {
  person: {
    readonly realName: string | null;
    readonly profileId: string | null;
    readonly pictureId?: string | null;
  };
  role: PersonRole;
  /** The way to write to them; none when there is no way to write. */
  contact: ChatContactLink | null;
}) {
  return (
    <section
      className={`${styles.flat} ${styles.party}`}
      aria-label={roleLabels[role]}
    >
      <span className={styles.who}>
        <strong>
          <PersonName person={person} role={role} />
        </strong>
        <span className={styles.role}>{roleLabels[role]}</span>
      </span>
      {contact && (
        <Link className="button button-secondary" href={contact.href}>
          {contact.existing
            ? `Gå til samtalen med ${personName(person)}`
            : `Skriv til ${personName(person)}`}
        </Link>
      )}
    </section>
  );
}
