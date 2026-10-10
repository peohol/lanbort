import type { LoanReview, LoanReviews } from "@lanbort/contracts";
import { Fragment, type ReactNode } from "react";
import { CommandForm } from "@/components/command-form";
import { describedBy, Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { loansHref } from "@/navigation/areas";
import { loanApi, partyTitle, personName } from "@/presentation/loan-status";
import { basisNote, hiddenUntil, scoreLines } from "@/presentation/reviews";
import styles from "../_parts/loan.module.css";
import { ReviewForm } from "./review-form";

/** A review as its parties see it, with its one response (PS-TRUST-005). */
function Review({
  review,
  heading,
  children,
}: {
  review: LoanReview;
  heading: string;
  children?: ReactNode;
}) {
  return (
    <article className={styles.review} aria-label={heading}>
      <h3>{heading}</h3>
      {review.status === "removed" ? (
        <p>Anmeldelsen er fjernet av moderering.</p>
      ) : (
        <>
          <dl className="facts">
            {scoreLines(review).map(({ dimension, label, text }) => (
              <Fragment key={dimension}>
                <dt>{label}</dt>
                <dd>{text}</dd>
              </Fragment>
            ))}
          </dl>
          {review.text && (
            <p className={`message-text ${styles.quote}`}>{review.text}</p>
          )}
          {review.moderated.textRemoved && (
            <p className="help">Teksten er fjernet av moderering.</p>
          )}
          {review.loanReopenedAt && (
            <p className="help">
              Lånet ble åpnet igjen etter at anmeldelsen ble publisert.
            </p>
          )}
        </>
      )}
      {review.response && (
        <div className={styles.quote}>
          <h4>Tilsvar</h4>
          <p className="message-text">
            {review.response.text ?? "Tilsvaret er fjernet av moderering."}
          </p>
        </div>
      )}
      {children}
    </article>
  );
}

/**
 * PS-TRUST-001–005, UX-JRN-010: after the loan ended, each party reviews
 * the other on what could actually be assessed. Their own review stays
 * hidden, and can be revised, until both have reviewed or the deadline;
 * the review of them appears then, and they may respond to it once.
 */
export function Reviews({ reviews }: { reviews: LoanReviews }) {
  const { loanId, window, own, received } = reviews;

  if (!window) {
    return null;
  }

  const other = personName(reviews.counterpart);
  const open = window.status === "open";
  const note = basisNote(window.basis);
  const respondHelp =
    "Du kan svare én gang. Tilsvaret vises sammen med anmeldelsen og endrer ikke vurderingen.";

  return (
    <section id="anmeldelser" aria-labelledby="anmeldelser-tittel">
      <h2 id="anmeldelser-tittel">Anmeldelser</h2>
      {window.status === "paused" && (
        <p>
          Lånet er åpnet igjen. Anmeldelsene venter til det er avsluttet på
          nytt.
        </p>
      )}
      {open && <p>{hiddenUntil(reviews, other)}</p>}
      {open && note && <p className="help">{note}</p>}
      {own ? (
        <Review review={own} heading={`Din anmeldelse av ${other}`}>
          {own.status === "hidden" && open && (
            <details>
              <summary>Endre anmeldelsen</summary>
              <ReviewForm
                loanId={loanId}
                dimensions={window.dimensions}
                own={own}
              />
            </details>
          )}
        </Review>
      ) : open ? (
        <div className={styles.review}>
          <h3>Anmeld {other}</h3>
          <ReviewForm
            loanId={loanId}
            dimensions={window.dimensions}
            own={null}
          />
        </div>
      ) : null}
      {received && (
        <Review review={received} heading={`${other} sin anmeldelse av deg`}>
          {!received.response && received.status === "published" && (
            <details>
              <summary>Gi et tilsvar</summary>
              <CommandForm
                path={`${loanApi(loanId)}/reviews/response`}
                fixed={{ loanId }}
                submitLabel="Send tilsvaret"
                secondary
              >
                <Field id="tilsvar" label="Tilsvar" help={respondHelp}>
                  <textarea
                    id="tilsvar"
                    name="text"
                    required
                    maxLength={2000}
                    {...describedBy("tilsvar", respondHelp)}
                  />
                </Field>
              </CommandForm>
            </details>
          )}
        </Review>
      )}
      {window.status === "closed" && !own && !received && (
        <p>Ingen av dere ga en anmeldelse.</p>
      )}
    </section>
  );
}

/**
 * A loan to a former party of its reviews, such as the responsible lender
 * before a change (PS-TRUST-003/005): its reviews (`children`) and only
 * what names them, the thing and the other party. Nothing else of the loan.
 */
export function ReviewsOnly({
  reviews,
  children,
}: {
  reviews: LoanReviews;
  children: ReactNode;
}) {
  const other = personName(reviews.counterpart);

  return (
    <main>
      <PageHeader
        kind="Lån"
        title={partyTitle(reviews.role, reviews.title, other)}
        back={{ href: loansHref, label: "Lån" }}
      >
        <p>
          Du er ikke lenger part i lånet. Her ser du anmeldelsene mellom deg og{" "}
          {other}.
        </p>
      </PageHeader>
      <div className={styles.column}>{children}</div>
    </main>
  );
}
