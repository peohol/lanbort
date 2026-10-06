import type { TrustProfile as Profile } from "@lanbort/contracts";
import { collectPages, readPerson, readTrustProfile } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { Tag } from "@/components/tag";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { personHref } from "@/navigation/routes";
import { describeRelation } from "@/presentation/people";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import { friendsHref, RelationActions } from "./relation-actions";
import { reviewsKey, TrustProfile } from "./trust-profile";

export const metadata: Metadata = { title: "Person – Lånbort" };

/**
 * The reviews the address asks for, with the profile's figures from the
 * first page. Null when the reader may not read the trust profile.
 */
async function trustOf(userId: string, query: SearchParams) {
  const first: { profile: Profile | null } = { profile: null };
  const reviews = await collectPages(
    async (cursor) => {
      const page = await pageQuery(readTrustProfile, { userId, cursor });
      first.profile ??= page;
      return page;
    },
    (page) => page.reviews,
    pagesShown(query, reviewsKey),
  );

  return first.profile ? { profile: first.profile, ...reviews } : null;
}

/**
 * A person (WP-86): who they are to the reader, what the reader can do
 * about it, and, for those with access to their profile, what others have
 * said about them in each role (PS-TRUST-006–007). Someone the reader may
 * not see shows the same «not found» as someone who does not exist
 * (PS-USR-006, UX-PRIV-007).
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
  const relation = describeRelation(person);
  const trust = person.trustProfile ? await trustOf(userId, query) : null;

  return (
    <main>
      <PageHeader
        title={person.realName}
        back={{ href: friendsHref, label: "Venner" }}
        context={relation.tag && <Tag tone={relation.tone}>{relation.tag}</Tag>}
      />
      <StatusCard
        heading="Dere to"
        status={relation.status}
        tone={relation.tone}
      >
        <RelationActions person={person} />
      </StatusCard>
      {trust ? (
        <TrustProfile
          profile={trust.profile}
          reviews={trust.items}
          more={
            trust.nextCursor === null
              ? null
              : morePagesHref(personHref(userId), query, reviewsKey, reviewsKey)
          }
        />
      ) : (
        <p className="quiet">
          Anmeldelser fra lån vises for venner og for medlemmer av et felles
          miljø.
        </p>
      )}
    </main>
  );
}
