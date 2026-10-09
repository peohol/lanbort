import type {
  DimensionTrust,
  ProfileReview,
  RoleTrust,
  TrustProfile,
} from "@lanbort/contracts";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PersonName } from "@/components/person-name";
import { ContextTag, Tag } from "@/components/tag";
import { type PersonRole, personRoleHref } from "@/navigation/routes";
import { formatTime } from "@/presentation/dates";
import { loanEndReasonLabels } from "@/presentation/loans";
import {
  describeDimension,
  dimensionLabel,
  fewScores,
  rolesInOrder,
  subjectRoleLabels,
} from "@/presentation/people";
import styles from "./person.module.css";

/** The reviews' element, and their pages in the address. */
export const reviewsKey = "anmeldelser";

/** The other role in a loan: who reviewed a person in `role`. */
const otherRole: Record<PersonRole, PersonRole> = {
  borrower: "lender",
  lender: "borrower",
};

/** Each role's part of the profile (PS-TRUST-006), and who reviewed it. */
export const roleParts = {
  borrower: {
    from: "utlånere",
    fromWhom: (name: string) => `dem som har lånt ut til ${name}`,
    trust: (profile: TrustProfile) => profile.asBorrower,
  },
  lender: {
    from: "låntakere",
    fromWhom: (name: string) => `dem som har lånt av ${name}`,
    trust: (profile: TrustProfile) => profile.asLender,
  },
} as const satisfies Record<PersonRole, unknown>;

export const reviewCount = (count: number) =>
  `${count} ${count === 1 ? "anmeldelse" : "anmeldelser"}`;

/** Whether a role's figures rest on so little that they say little. */
export const restsOnLittle = (trust: RoleTrust) =>
  trust.reviews > 0 && trust.reviews < fewScores;

const fewTag = <Tag icon="info">Få vurderinger</Tag>;

/**
 * How the scores of one dimension spread over 1–5: one dot per score under
 * the score it got, a number instead above six, and the same in words to
 * assistive technology.
 */
function Strip({
  distribution,
  label,
}: {
  distribution: readonly number[];
  label: string;
}) {
  return (
    <div role="img" aria-label={label}>
      <div className={styles.strip}>
        {distribution.map((count, index) => (
          <span key={index} className={styles.cell}>
            {count > 6
              ? count
              : Array.from({ length: count }, (_, dot) => (
                  <span key={dot} className={styles.dot} />
                ))}
          </span>
        ))}
      </div>
      <div className={styles.scale} aria-hidden="true">
        {distribution.map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
    </div>
  );
}

function Dimension({
  trust,
  roleFew,
}: {
  trust: DimensionTrust;
  roleFew: boolean;
}) {
  const { summary, spread, note } = describeDimension(trust, {
    fewSaid: roleFew,
  });

  return (
    <li className={styles.dimension}>
      <div className={styles.dimensionHead}>
        <strong>{dimensionLabel(trust.dimension)}</strong>
        <span>{summary}</span>
      </div>
      {spread && <Strip distribution={trust.distribution} label={spread} />}
      {note && <p className={styles.note}>{note}</p>}
    </li>
  );
}

/** A dimension with something to show: scores, or scores held out. */
const scored = (dimension: DimensionTrust) =>
  dimension.count > 0 || dimension.setAside > 0;

/**
 * What others said about the person in one role, per dimension: the mean
 * with what it rests on and how the scores spread, never one score for the
 * person (PS-TRUST-006). Dimensions nobody has scored yet are left out.
 * When the role as a whole rests on little, that is said once around it,
 * not again for each dimension.
 */
export function Dimensions({
  trust,
  label,
}: {
  trust: RoleTrust;
  label: string;
}) {
  return (
    <ul className={styles.dimensions} aria-label={label}>
      {trust.dimensions.filter(scored).map((dimension) => (
        <Dimension
          key={dimension.dimension}
          trust={dimension}
          roleFew={restsOnLittle(trust)}
        />
      ))}
    </ul>
  );
}

/**
 * «Erfaringer fra lån» on the person's page (PS-TRUST-006, UX-PRIV-012):
 * one card per role, the role of the entry first, each leading to the
 * role's own page with the reviews. A wider screen unfolds the figures.
 * A role without reviews says so and leads nowhere, since there is
 * nothing more to read.
 */
export function TrustSummary({
  userId,
  profile,
  role,
}: {
  userId: string;
  profile: TrustProfile;
  /** The person's role where the page was opened from, if it has one. */
  role: PersonRole | null;
}) {
  return (
    <section aria-labelledby="tillit" className={styles.section}>
      <h2 id="tillit">Erfaringer fra lån</h2>
      <div className={styles.roles}>
        {rolesInOrder(role).map((each) => {
          const trust = roleParts[each].trust(profile);
          const heading = subjectRoleLabels[each];
          const href = personRoleHref(userId, each);

          return (
            <section
              key={each}
              aria-labelledby={`rolle-${each}`}
              className={styles.role}
            >
              <div className={styles.row}>
                <div className={styles.rowText}>
                  <h3 id={`rolle-${each}`} className={styles.title}>
                    {trust.reviews > 0 ? (
                      <Link href={href}>{heading}</Link>
                    ) : (
                      heading
                    )}
                    {restsOnLittle(trust) && fewTag}
                  </h3>
                  <span>
                    {trust.reviews > 0
                      ? `${reviewCount(trust.reviews)} fra ${roleParts[each].from}`
                      : "Ingen anmeldelser ennå"}
                  </span>
                </div>
                {trust.reviews > 0 && (
                  <Icon name="chevron" className={`icon ${styles.chevron}`} />
                )}
              </div>
              {trust.reviews > 0 && (
                <div className={styles.unfolded}>
                  <Dimensions trust={trust} label={`${heading}, vurderinger`} />
                  <p className={styles.note}>
                    <Link href={href}>Les anmeldelsene ({trust.reviews})</Link>
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

/** One review as the reader may see it (PS-TRUST-007). */
function Review({ review, name }: { review: ProfileReview; name: string }) {
  const contested = review.scores.some((score) => score.contested);

  return (
    <li className={styles.review}>
      {(review.environment || contested) && (
        <div className="tags">
          {review.environment && (
            <ContextTag label="Miljø" icon="environment">
              Via {review.environment.name}
            </ContextTag>
          )}
          {contested && <Tag tone="warning">Omstridt</Tag>}
        </div>
      )}
      <p>
        Fra{" "}
        {review.author ? (
          <PersonName
            person={review.author}
            role={otherRole[review.subjectRole]}
          />
        ) : (
          "en tidligere bruker"
        )}
        .{" "}
        <span className="entry-detail">
          {loanEndReasonLabels[review.basis]},{" "}
          <time dateTime={review.publishedAt}>
            {formatTime(review.publishedAt)}
          </time>
        </span>
      </p>
      <dl className={styles.scores} aria-label="Vurderinger">
        {review.scores.map((score) => (
          <div key={score.dimension}>
            <dt>{dimensionLabel(score.dimension)}</dt>
            <dd>
              {score.contested ? (
                <del>{score.score} av 5, telles ikke</del>
              ) : (
                `${score.score} av 5`
              )}
            </dd>
          </div>
        ))}
      </dl>
      {contested && (
        <p className="help">
          Lånet ble åpnet igjen etter at anmeldelsen ble publisert, så noen
          vurderinger telles ikke med.
        </p>
      )}
      {review.text && <p className={styles.quote}>{review.text}</p>}
      {review.response && (
        <p className={styles.reply}>
          <span className={styles.replyLabel}>Svar fra {name}</span>
          {review.response.text}
        </p>
      )}
    </li>
  );
}

/**
 * The reviews the reader may read, newest first (PS-TRUST-007). Nothing
 * marks reviews the reader may not read.
 */
export function Reviews({
  name,
  reviews,
  more,
}: {
  /** The person the reviews are about, who may reply once to each. */
  name: string;
  reviews: readonly ProfileReview[];
  /** The address of the next page of reviews, if there is one. */
  more: string | null;
}) {
  return (
    <section aria-labelledby={reviewsKey} className={styles.section}>
      <h2 id={reviewsKey}>Anmeldelser</h2>
      {reviews.length === 0 ? (
        <EmptyState>Ingen anmeldelser å vise.</EmptyState>
      ) : (
        <ol className={styles.reviews} aria-label="Anmeldelser, nyeste først">
          {reviews.map((review) => (
            <Review key={review.id} review={review} name={name} />
          ))}
        </ol>
      )}
      {more && (
        <p className="link-row">
          <a href={more}>Vis eldre anmeldelser</a>
        </p>
      )}
    </section>
  );
}
