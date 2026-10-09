import type { TrustProfile } from "@lanbort/contracts";
import { collectPages, readPerson, readTrustProfile } from "@lanbort/domain";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import { personHref, personRoleHref } from "@/navigation/routes";
import { subjectRoleLabels } from "@/presentation/people";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";
import styles from "../person.module.css";
import { roleOfSegment } from "../role";
import {
  Dimensions,
  restsOnLittle,
  reviewCount,
  Reviews,
  reviewsKey,
  roleParts,
} from "../trust";

export const metadata: Metadata = { title: "Erfaringer fra lån – Lånbort" };

/**
 * What others said about a person in one role (PS-TRUST-006–007): per
 * dimension the mean, what it rests on and how the scores spread, and the
 * reviews about them in that role, newest first. Only for those who may
 * read the person's trust profile; anyone else finds nothing here.
 */
export default async function PersonRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string; rolle: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requirePageAccount();
  const [{ userId, rolle }, query] = await Promise.all([params, searchParams]);
  const role = roleOfSegment(rolle);

  if (!role) notFound();

  const person = await pageQueryOrNotFound(readPerson, { userId });

  if (!person.trustProfile) notFound();

  const first: { profile: TrustProfile | null } = { profile: null };
  const reviews = await collectPages(
    async (cursor) => {
      const page = await pageQuery(readTrustProfile, {
        userId,
        role,
        ...(cursor ? { cursor } : {}),
      });
      first.profile ??= page;
      return page;
    },
    (page) => page.reviews,
    pagesShown(query, reviewsKey),
  );

  if (!first.profile) notFound();

  const name = person.realName;
  const heading = subjectRoleLabels[role];
  const trust = roleParts[role].trust(first.profile);

  return (
    <main>
      <PageHeader
        kind={heading}
        title={`${name} ${heading.toLowerCase()}`}
        back={{ href: personHref(userId, role), label: name }}
      >
        {trust.reviews > 0
          ? `${reviewCount(trust.reviews)} fra ${roleParts[role].fromWhom(name)}. Hver vurdering er fra 1 til 5.`
          : "Ingen anmeldelser ennå."}
      </PageHeader>
      {restsOnLittle(trust) && (
        <p className={styles.callout}>
          <Icon name="info" />
          Få vurderinger, så snittet sier lite.
        </p>
      )}
      {trust.reviews > 0 && (
        <>
          <div className={styles.card}>
            <Dimensions trust={trust} label="Vurderinger per tema" />
          </div>
          <Reviews
            name={name}
            reviews={reviews.items}
            more={
              reviews.nextCursor === null
                ? null
                : morePagesHref(
                    personRoleHref(userId, role),
                    query,
                    reviewsKey,
                    reviewsKey,
                  )
            }
          />
        </>
      )}
    </main>
  );
}
