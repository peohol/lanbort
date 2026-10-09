import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/**
 * A list of places to go (UX-IA-020): a card of rows, each with an icon or
 * a picture, a name, a short line about it and a chevron, the whole row
 * one link. Konto's menu, the loans between two people, a friend's things.
 */
export function MenuList({
  label,
  children,
}: {
  /** The id of the heading that names the list. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <ul className="menu" aria-labelledby={label}>
      {children}
    </ul>
  );
}

export function MenuRow({
  href,
  icon,
  lead,
  label,
  detail,
  end,
}: {
  href: string;
  /** A quiet icon at the start of the row. */
  icon?: IconName;
  /** In place of the icon: a picture, or a soft square for a thing. */
  lead?: ReactNode;
  label: string;
  /** What the row is about in a short line or two under the name, such as
   * «12 venner» or a loan's role and period. */
  detail?: ReactNode;
  /** What asks for attention at the end of the row, such as a `Tag`. */
  end?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="menu-row">
        {lead ? (
          <span className="menu-lead">{lead}</span>
        ) : (
          icon && <Icon name={icon} />
        )}
        <div className="menu-text">
          <span className="menu-label">{label}</span>
          {detail && <div className="menu-detail">{detail}</div>}
        </div>
        {end}
        <Icon name="chevron" className="icon menu-chevron" />
      </Link>
    </li>
  );
}
