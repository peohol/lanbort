import {
  type FriendObjectList,
  type LoanList,
  type ObjectCategory,
  thingListLimit,
} from "@lanbort/contracts";
import Link from "next/link";
import { EntryDetail } from "@/components/entry-detail";
import { Icon } from "@/components/icon";
import { MenuList, MenuRow } from "@/components/menu-list";
import { FoundThingCard } from "@/components/thing-card";
import { ThingList, type ThingListFilter } from "@/components/thing-list";
import { loansHref } from "@/navigation/areas";
import { loanHref, objectHref } from "@/navigation/routes";
import { formatShortPeriod } from "@/presentation/dates";
import { loanRoleLabels, loanStatusLabels } from "@/presentation/loans";
import { firstImageHref, friendImageHref } from "@/presentation/object-images";
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
            lead={<Icon name="things" />}
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
 * The things a friend has made visible to friends (PS-OBJ-020): what the
 * reader may borrow directly from them, each leading to the thing as seen
 * directly between friends, grouped by category and filtered like every
 * list of things (UX-IA-021). Nothing when there are none.
 */
export function FriendThings({
  name,
  things,
  more,
  categories,
  filter,
  today,
}: {
  name: string;
  things: FriendObjectList["objects"];
  /** There are more than are shown. */
  more: boolean;
  categories: readonly ObjectCategory[];
  filter: ThingListFilter;
  today: string;
}) {
  if (things.length === 0) return null;

  return (
    <section aria-labelledby="venners-ting" className={styles.section}>
      <h2 id="venners-ting" className={styles.iconHeading}>
        <Icon name="things" />
        {`Ting du kan låne direkte fra ${name}`}
      </h2>
      <ThingList
        things={things}
        categories={categories}
        today={today}
        filter={filter}
        card={(thing) => (
          <FoundThingCard
            key={thing.objectId}
            thing={thing}
            href={objectHref(thing.objectId, { kind: "direct" })}
            image={firstImageHref(thing.images, (imageId) =>
              friendImageHref(thing.objectId, imageId),
            )}
            today={today}
          />
        )}
      />
      {more && (
        <p className="quiet">Viser de {thingListLimit} nyeste tingene.</p>
      )}
    </section>
  );
}
