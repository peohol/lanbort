import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/**
 * The step that makes something new, such as «Registrer en ting» or
 * «Opprett et miljø»: the primary button with a plus, as wide as the
 * column on a phone (Tomat kjerneflyt 2), so it never reads as a link.
 */
export function CreateButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="button button-primary create-button" href={href}>
      <Icon name="plus" /> {children}
    </Link>
  );
}
