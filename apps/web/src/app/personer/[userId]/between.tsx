import type { FriendObjectList, LoanList } from "@lanbort/contracts";
import Link from "next/link";
import { EntryDetail } from "@/components/entry-detail";
import { MenuList, MenuRow } from "@/components/menu-list";
import { ContextTag } from "@/components/tag";
import { loansHref } from "@/navigation/areas";
import { loanHref, objectHref } from "@/navigation/routes";
import { formatShortPeriod } from "@/presentation/dates";
import { loanRoleLabels, loanStatusLabels } from "@/presentation/loans";
import { describeAvailability } from "@/presentation/objects";
import styles from "./person.module.css";

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
      <MenuList label="mellom-dere">
        {loans.loans.map((loan) => (
          <MenuRow
            key={loan.id}
            icon="things"
            href={loanHref(loan.id)}
            label={loan.agreement.title}
            detail={
              <EntryDetail
                parts={[
                  loanRoleLabels[loan.role],
                  loanStatusLabels[loan.status],
                  formatShortPeriod(loan.period),
                ]}
              />
            }
          />
        ))}
      </MenuList>
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
        <MenuList label="venners-ting">
          {things.map((thing) => (
            <MenuRow
              key={thing.objectId}
              icon="things"
              href={objectHref(thing.objectId, { kind: "direct" })}
              label={thing.title}
              detail={
                <>
                  {describeAvailability(thing, today)}{" "}
                  <ContextTag label="Synlig" icon="people">
                    Direkte mellom venner
                  </ContextTag>
                </>
              }
            />
          ))}
        </MenuList>
      )}
      {more && (
        <p className="link-row">
          <a href={more}>Vis flere ting</a>
        </p>
      )}
    </section>
  );
}
