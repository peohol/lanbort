"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pilotHref, pilotLeadPages } from "@/navigation/pilot";
import styles from "./pilot.module.css";

/** The lead's own pages of the pilot, the current one marked. */
export function PilotNav() {
  const pathname = usePathname();
  const current = (href: string) =>
    href === pilotHref
      ? pathname === href || pathname.startsWith(`${href}/tester`)
      : pathname.startsWith(href);

  return (
    <nav aria-label="Piloten" className={`filters ${styles.nav}`}>
      {pilotLeadPages.map((page) => (
        <Link
          key={page.href}
          href={page.href}
          aria-current={current(page.href) ? "page" : undefined}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
