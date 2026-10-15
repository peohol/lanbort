import {
  calendarDate,
  listFriendObjects,
  listInvitableEnvironments,
  listLoans,
  listObjectCategories,
  readPerson,
  readTrustProfile,
} from "@lanbort/domain";
import type { Person } from "@lanbort/contracts";
import type { Metadata } from "next";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ProfilePicture } from "@/components/profile-picture";
import { ContextTag, Tag } from "@/components/tag";
import type { SearchParams } from "@/navigation/list-pages";
import { personHref } from "@/navigation/routes";
import { describeRelation, whyVisible } from "@/presentation/people";
import { readThingFilter, thingFilterHref } from "@/presentation/thing-list";
import { chatContactLink } from "@/server/chat-contact";
import { unavailabilityReportLink } from "@/server/unavailability-report";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { Between, FriendThings } from "./between";
import { InviteTo } from "./invite";
import styles from "./person.module.css";
import { PersonMoreActions, RelationCard } from "./relation";
import { roleIn } from "./role";
import { TrustSummary } from "./trust";

export const metadata: Metadata = { title: "Person – Lånbort" };

/**
 * The things a friend has made visible to friends, with the categories to
 * group them by; none for anyone who is not a friend (PS-OBJ-020).
 */
async function friendThingsOf(person: Person) {
  if (person.relation?.friendship !== "friends") return null;

  const [things, categories] = await Promise.all([
    pageQuery(listFriendObjects, { userId: person.userId }),
    pageQuery(listObjectCategories, {}),
  ]);

  return things && { ...things, categories: categories?.categories ?? [] };
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
 * them now, where the reader may invite them (PS-ENV-018), what others
 * said about them in each role (PS-TRUST-006–007) and, for a friend, the
 * things they show friends. Someone the reader may
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
  const [loans, trust, things, contact, invitable, unavailabilityReport] =
    await Promise.all([
      person.relation
        ? pageQuery(listLoans, { state: "current", counterpartId: userId })
        : null,
      person.trustProfile ? pageQuery(readTrustProfile, { userId }) : null,
      friendThingsOf(person),
      chatContactLink(userId),
      person.relation && !person.relation.blockedByMe
        ? pageQuery(listInvitableEnvironments, { userId })
        : null,
      unavailabilityReportLink(userId),
    ]);
  const why = whyVisible(person);
  const { picture, context } = header(person);

  return (
    <main className={`main-wide ${styles.page}`}>
      <PageHeader
        kind="Person"
        title={person.realName}
        picture={picture}
        home="home"
        context={context}
      />
      {why && (
        <p className={styles.why}>
          <Icon name="info" />
          <span>{why}</span>
        </p>
      )}
      <RelationCard person={person} writeHref={contact?.href ?? null} />
      {loans && <Between loans={loans} />}
      {invitable && (
        <InviteTo
          userId={userId}
          name={person.realName}
          environments={invitable.environments}
        />
      )}
      <div className={styles.aside}>
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
      </div>
      {things && (
        <FriendThings
          name={person.realName}
          things={things.objects}
          more={things.more}
          categories={things.categories}
          filter={{
            chosen: readThingFilter(query),
            href: (filter) =>
              thingFilterHref(personHref(userId), query, filter),
          }}
          today={calendarDate(new Date())}
        />
      )}
      <PersonMoreActions
        person={person}
        unavailabilityReport={unavailabilityReport}
      />
    </main>
  );
}
