import {
  calendarDate,
  collectPages,
  listFriendObjects,
  listLoans,
  readPerson,
  readTrustProfile,
} from "@lanbort/domain";
import type { Person } from "@lanbort/contracts";
import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ProfilePicture } from "@/components/profile-picture";
import { ContextTag, Tag } from "@/components/tag";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { personHref } from "@/navigation/routes";
import { describeRelation, whyVisible } from "@/presentation/people";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { Between, FriendThings } from "./between";
import styles from "./person.module.css";
import { friendsHref, PersonMoreActions, RelationCard } from "./relation";
import { roleIn } from "./role";
import { TrustSummary } from "./trust";

export const metadata: Metadata = { title: "Person – Lånbort" };

/** The friend's things' element, and their pages in the address. */
const thingsKey = "ting";

/**
 * The things a friend has made visible to friends, as many pages as the
 * address asks for; none for anyone who is not a friend (PS-OBJ-020).
 */
async function friendThingsOf(person: Person, query: SearchParams) {
  if (person.relation?.friendship !== "friends") return null;

  return collectPages(
    (cursor) =>
      pageQuery(listFriendObjects, {
        userId: person.userId,
        ...(cursor ? { cursor } : {}),
      }),
    (page) => page.objects,
    pagesShown(query, thingsKey),
  );
}

/**
 * The person's header: the picture, or initials where none is shown; a tag
 * for the relation; the environments they share with the reader
 * (UX-PRIV-003).
 */
function header(person: Person) {
  const { tag } = describeRelation(person);

  return {
    picture: (
      <ProfilePicture
        pictureId={person.pictureId}
        name={person.realName}
        size="medium"
        initials
      />
    ),
    context: (tag || person.sharedEnvironments.length > 0) && (
      <>
        {tag && (
          <Tag tone={tag.tone} icon={tag.icon}>
            {tag.text}
          </Tag>
        )}
        {person.sharedEnvironments.map((environment) => (
          <ContextTag key={environment.id} label="Miljø" icon="environment">
            {environment.name}
          </ContextTag>
        ))}
      </>
    ),
  };
}

/**
 * A person (WP-86, kjerneflyt 6): who they are, why the reader sees them,
 * where the reader stands with them and the next step, what is between
 * them now, what others said about them in each role (PS-TRUST-006–007)
 * and, for a friend, the things they show friends. Someone the reader may
 * not see shows the same «not found» as someone who does not exist
 * (PS-USR-006, UX-PRIV-007). There are no activity figures (PS-TRUST-017).
 */
export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const person = await pageQueryOrNotFound(readPerson, { userId });
  const [loans, trust, things] = await Promise.all([
    person.relation
      ? pageQuery(listLoans, { state: "current", counterpartId: userId })
      : null,
    person.trustProfile ? pageQuery(readTrustProfile, { userId }) : null,
    friendThingsOf(person, query),
  ]);
  const why = whyVisible(person);
  const { picture, context } = header(person);

  return (
    <main>
      <PageHeader
        kind="Person"
        title={person.realName}
        picture={picture}
        back={{ href: friendsHref, label: "Venner" }}
        context={context}
      />
      {why && (
        <p className={styles.why}>
          <Icon name="info" />
          <span>{why}</span>
        </p>
      )}
      <RelationCard person={person} />
      {loans && <Between loans={loans} />}
      {trust ? (
        <TrustSummary userId={userId} profile={trust} role={roleIn(query)} />
      ) : (
        !person.relation?.blockedByMe && (
          <p className="quiet">
            Anmeldelser fra lån vises for venner og for medlemmer av et felles
            miljø.
          </p>
        )
      )}
      {things && (
        <FriendThings
          name={person.realName}
          things={things.items}
          today={calendarDate(new Date())}
          more={
            things.nextCursor === null
              ? null
              : morePagesHref(
                  personHref(userId),
                  query,
                  thingsKey,
                  "venners-ting",
                )
          }
        />
      )}
      <PersonMoreActions person={person} />
    </main>
  );
}
