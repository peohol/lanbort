import type { ReactNode } from "react";
import type { FriendObjectList, LoanList } from "@lanbort/contracts";
import Link from "next/link";
import { EntryDetail } from "@/components/entry-detail";
import { Icon, type IconName } from "@/components/icon";
import { ContextTag } from "@/components/tag";
import { loansHref } from "@/navigation/areas";
import { loanHref, objectHref } from "@/navigation/routes";
import { formatShortPeriod } from "@/presentation/dates";
import { loanRoleLabels, loanStatusLabels } from "@/presentation/loans";
import { describeAvailability } from "@/presentation/objects";
import styles from "./person.module.css";

/** A row that leads on: what it is, a line about it, and a chevron. */
function Row({
  icon,
  href,
  title,
  children,
}: {
  icon: IconName;
  href: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.lead}>
        <Icon name={icon} />
      </span>
      <div className={styles.rowText}>
        <Link href={href}>{title}</Link>
        {children}
      </div>
      <Icon name="chevron" className={`icon ${styles.chevron}`} />
    </li>
  );
}

/**
 * «Mellom dere nå»: the reader's loans with the person that have not ended,
 * before what others say about them (UX-IA-008). Nothing when there are
 * none.
 */
export function Between({ loans }: { loans: LoanList }) {
  if (loans.loans.length === 0) return null;

  return (
    <section aria-labelledby="mellom-dere" className={styles.section}>
      <h2 id="mellom-dere">Mellom dere nå</h2>
      <ul className={styles.rows}>
        {loans.loans.map((loan) => (
          <Row
            key={loan.id}
            icon="things"
            href={loanHref(loan.id)}
            title={loan.agreement.title}
          >
            <EntryDetail
              parts={[
                loanRoleLabels[loan.role],
                loanStatusLabels[loan.status],
                formatShortPeriod(loan.period),
              ]}
            />
          </Row>
        ))}
      </ul>
      {loans.nextCursor && (
        <p className="link-row">
          <Link href={loansHref}>Alle lånene dine</Link>
        </p>
      )}
    </section>
  );
}

/**
 * The things a friend has made visible to friends (PS-OBJ-020), newest
 * first, each leading to the thing as seen directly between friends.
 */
export function FriendThings({
  name,
  things,
  more,
  today,
}: {
  name: string;
  things: FriendObjectList["objects"];
  /** The address of the next page of things, if there is one. */
  more: string | null;
  today: string;
}) {
  return (
    <section aria-labelledby="venners-ting" className={styles.section}>
      <h2 id="venners-ting">Tingene {name} har gjort synlige for venner</h2>
      {things.length === 0 ? (
        <p className="quiet">{name} har ingen ting synlige for venner nå.</p>
      ) : (
        <ul className={styles.rows}>
          {things.map((thing) => (
            <Row
              key={thing.objectId}
              icon="things"
              href={objectHref(thing.objectId, { kind: "direct" })}
              title={thing.title}
            >
              <span>{describeAvailability(thing, today)}</span>
              <ContextTag label="Synlig" icon="people">
                Direkte mellom venner
              </ContextTag>
            </Row>
          ))}
        </ul>
      )}
      {more && (
        <p className="link-row">
          <a href={more}>Vis flere ting</a>
        </p>
      )}
    </section>
  );
}
