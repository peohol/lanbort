import type { LoanListEntry } from "@/presentation/loan-list";
import { MenuList, MenuRow } from "./menu-list";

/**
 * A list in the Lån area (KF1 v2): each row the loan's or request's name
 * and its situation in a line, leading to its own page. `more` leads to the
 * same list with its next page, while there is one.
 */
export function LoanList({
  label,
  entries,
  more,
}: {
  /** The id of the heading that names the list. */
  label?: string;
  entries: readonly LoanListEntry[];
  more?: { href: string; text: string } | null;
}) {
  return (
    <>
      <MenuList {...(label && { label })}>
        {entries.map((entry) => (
          <MenuRow
            key={entry.key}
            href={entry.href}
            label={entry.title}
            detail={entry.status}
          />
        ))}
      </MenuList>
      {more && (
        <p className="link-row">
          <a href={more.href}>{more.text}</a>
        </p>
      )}
    </>
  );
}
