"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { accountHref, areaAt, areaOf, areas } from "@/navigation/areas";
import { isStackOf, samePlace } from "@/navigation/stack";
import { Icon } from "./icon";
import { enterArea, useStack } from "./navigation-stack";

/**
 * UX-IA-001: the five areas. One list for every screen size: at the bottom
 * on a narrow screen, at the side on a wide one (globals.css), with the
 * same labels and order (UX-A11Y-001). The marked area is the one the user
 * started in, which a detail's stack carries (UX-IA-009): a person opened
 * from a thing in Finn lies in Finn. It is marked for assistive technology
 * too, not only by its look. An area's own page starts its stack over.
 */
export function MainNavigation() {
  const pathname = usePathname();
  const stack = useStack();
  const root = areaAt(pathname);
  // The account is no area (UX-IA-003), whatever stack it lies in.
  const current = samePlace(pathname, accountHref)
    ? null
    : isStackOf(stack, pathname)
      ? stack!.area
      : (root ?? areaOf(pathname));

  useEffect(() => {
    if (root) enterArea(root);
  }, [root, pathname]);

  return (
    <nav className="main-navigation" aria-label="Hovedmeny">
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <Link
              href={area.href}
              aria-current={area.id === current ? "page" : undefined}
            >
              <Icon name={area.id} />
              <span>{area.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
