import { Fragment } from "react";
import type {
  ProfileReview,
  RoleTrust,
  TrustProfile as Profile,
} from "@lanbort/contracts";
import { EmptyState } from "@/components/empty-state";
import { PersonName } from "@/components/person-name";
import { ContextTag, Tag } from "@/components/tag";
import { formatTime } from "@/presentation/dates";
import { loanEndReasonLabels } from "@/presentation/loans";
import {
  describeDimension,
  dimensionLabel,
  subjectRoleLabels,
} from "@/presentation/people";

/** The reviews' element, and their pages in the address. */
export const reviewsKey = "anmeldelser";

/**
 * What others said about the person in one role (PS-TRUST-006): per
 * dimension the mean with what it rests on, never one score for the person.
 */
function Role({
  id,
  heading,
  from,
  trust,
}: {
  id: string;
  heading: string;
  /** Who reviewed the person in this role. */
  from: string;
  trust: RoleTrust;
}) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id}>{heading}</h3>
      {trust.reviews === 0 ? (
        <p className="quiet">Ingen anmeldelser ennå.</p>
      ) : (
        <>
          <p className="help">
            {trust.reviews === 1
              ? "1 anmeldelse"
              : `${trust.reviews} anmeldelser`}{" "}
            fra {from}.
          </p>
          <dl className="facts">
            {trust.dimensions.map((dimension) => {
              const { summary, spread, note } = describeDimension(dimension);

              return (
                <Fragment key={dimension.dimension}>
                  <dt>{dimensionLabel(dimension.dimension)}</dt>
                  <dd>
                    {summary}
                    {spread && <span className="quiet">. {spread}</span>}
                    {note && <span className="help"> {note}</span>}
                  </dd>
                </Fragment>
              );
            })}
          </dl>
        </>
      )}
    </section>
  );
}

/** One review as the reader may see it (PS-TRUST-007). */
function Review({ review }: { review: ProfileReview }) {
  const contested = review.scores.some((score) => score.contested);

  return (
    <li className="entry">
      <div className="tags">
        <Tag>{subjectRoleLabels[review.subjectRole]}</Tag>
        {review.environment && (
          <ContextTag label="Miljø">{review.environment.name}</ContextTag>
        )}
        {contested && <Tag tone="warning">Omstridt</Tag>}
      </div>
      <p>
        Fra{" "}
        {review.author ? (
          <PersonName person={review.author} />
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
      <ul aria-label="Vurderinger">
        {review.scores.map((score) => (
          <li key={score.dimension}>
            {dimensionLabel(score.dimension)}: {score.score} av 5
            {score.contested && " (omstridt, telles ikke med)"}
          </li>
        ))}
      </ul>
      {contested && (
        <p className="help">
          Lånet ble åpnet igjen etter at anmeldelsen ble publisert, så noen
          vurderinger telles ikke med.
        </p>
      )}
      {review.text && <p className="message-text">{review.text}</p>}
      {review.response && (
        <p className="message-text">
          <strong>Svar:</strong> {review.response.text}
        </p>
      )}
    </li>
  );
}

/**
 * The person's trust profile (PS-TRUST-006–012): what lenders and
 * borrowers said, kept apart, and the reviews the reader may read, newest
 * first. Nothing marks reviews the reader may not read.
 */
export function TrustProfile({
  profile,
  reviews,
  more,
}: {
  profile: Profile;
  reviews: readonly ProfileReview[];
  /** The address of the next page of reviews, if there is one. */
  more: string | null;
}) {
  return (
    <section aria-labelledby="tillit">
      <h2 id="tillit">Erfaringer fra lån</h2>
      <Role
        id="som-laantaker"
        heading="Som låntaker"
        from="utlånere"
        trust={profile.asBorrower}
      />
      <Role
        id="som-utlaaner"
        heading="Som utlåner"
        from="låntakere"
        trust={profile.asLender}
      />
      <h3 id={reviewsKey}>Anmeldelser</h3>
      {reviews.length === 0 ? (
        <EmptyState>Ingen anmeldelser å vise.</EmptyState>
      ) : (
        <ol className="entries" aria-label="Anmeldelser, nyeste først">
          {reviews.map((review) => (
            <Review key={review.id} review={review} />
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
