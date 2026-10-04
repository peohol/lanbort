import Link from "next/link";

/** One loan or request as the Lån area lists it, already in words. */
export interface LoanListEntry {
  /** The element id notifications and Home lead to. */
  readonly id: string;
  /** The page of its own, if it has one. */
  readonly href: string | null;
  readonly title: string;
  readonly role: string;
  readonly status: string;
  readonly period: string;
  /** What it asks of the user now, if anything (as on Home). */
  readonly waiting: string | null;
}

/** The id of the list headed `heading`, for links back to it. */
export const loanListId = (heading: string) =>
  `liste-${heading.toLowerCase().replace(/\W+/g, "-")}`;

/**
 * A list in the Lån area: the current status and what is next first
 * (UX-IA-008); details and history belong to the loan itself. `more` leads
 * to the same list with its next page, while there is one.
 */
export function LoanList({
  heading,
  empty,
  entries,
  more,
}: {
  heading: string;
  empty: string;
  entries: readonly LoanListEntry[];
  more: string | null;
}) {
  const headingId = loanListId(heading);

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      {entries.length === 0 ? (
        <p className="quiet">{empty}</p>
      ) : (
        <ul className="entries">
          {entries.map((entry) => (
            <li key={entry.id} id={entry.id} className="entry" tabIndex={-1}>
              <strong>
                {entry.href ? (
                  <Link href={entry.href}>{entry.title}</Link>
                ) : (
                  entry.title
                )}
              </strong>
              <span className="entry-detail">
                {entry.role} · {entry.period}
              </span>
              <span>{entry.status}</span>
              {entry.waiting && (
                <span className="waiting">Venter på deg: {entry.waiting}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {more && (
        <p className="link-row">
          <a href={more}>Vis flere {heading.toLowerCase()}</a>
        </p>
      )}
    </section>
  );
}
