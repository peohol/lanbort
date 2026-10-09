import Link from "next/link";
import { PersonName } from "@/components/person-name";
import type { PersonRole } from "@/navigation/routes";
import { personName } from "@/presentation/people";
import styles from "./loan.module.css";

const roleLabels: Record<PersonRole, string> = {
  borrower: "Låntaker",
  lender: "Ansvarlig utlåner",
};

/**
 * The other party of the loan (KF7): who they are in it, and the way to
 * write to them where there is one. Their name leads to their page while
 * the reader may open it (UX-PRIV-007).
 */
export function Party({
  person,
  role,
  writeHref,
}: {
  person: {
    readonly realName: string | null;
    readonly profileId: string | null;
    readonly pictureId?: string | null;
  };
  role: PersonRole;
  /** Where «Skriv til» leads; none when there is no way to write. */
  writeHref: string | null;
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
      {writeHref && (
        <Link className="button button-secondary" href={writeHref}>
          Skriv til {personName(person)}
        </Link>
      )}
    </section>
  );
}
