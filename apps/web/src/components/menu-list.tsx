import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/**
 * A list of places to go, such as the account's own pages (UX-IA-020): a
 * card of rows, each with an icon, a name, a short state and a chevron.
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
  label,
  detail,
  end,
}: {
  href: string;
  icon: IconName;
  label: string;
  /** A short state under the name, such as «12 venner». */
  detail?: ReactNode;
  /** What asks for attention at the end of the row, such as a `Tag`. */
  end?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="menu-row">
        <Icon name={icon} />
        <span className="menu-text">
          <span className="menu-label">{label}</span>
          {detail && <span className="menu-detail">{detail}</span>}
        </span>
        {end}
        <Icon name="chevron" className="icon menu-chevron" />
      </Link>
    </li>
  );
}
