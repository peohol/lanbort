import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The top of a page (WP-80): the way back to where it belongs, its title,
 * the context it is seen in (UX-PRIV-003, as `ContextTag`s) and a short
 * lead. Areas' own pages need no way back; detail pages do.
 */
export function PageHeader({
  title,
  back,
  context,
  children,
}: {
  title: ReactNode;
  back?: { href: string; label: string };
  context?: ReactNode;
  /** A short lead under the title. */
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      {back && (
        <Link className="back-link" href={back.href}>
          <span aria-hidden="true">‹</span> {back.label}
        </Link>
      )}
      <h1>{title}</h1>
      {context && <div className="tags">{context}</div>}
      {children && <p className="page-lead">{children}</p>}
    </header>
  );
}
