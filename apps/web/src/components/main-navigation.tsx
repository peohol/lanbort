"use client";

import { isNewsArea } from "@lanbort/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { areaAt, areaOf, areas, layerOf } from "@/navigation/areas";
import { isStackOf } from "@/navigation/stack";
import { badgeCount, useAttention } from "./attention";
import { Icon } from "./icon";
import { enterArea, trackAddress, useStack } from "./navigation-stack";
import { usePendingPath } from "./navigation-progress";

/**
 * UX-IA-001: the five areas. One list for every screen size: at the bottom
 * on a narrow screen, at the side on a wide one (globals.css), with the
 * same labels and order (UX-A11Y-001). The marked area is the one the user
 * started in, which a detail's stack carries (UX-IA-009): a person opened
 * from a thing in Finn lies in Finn. It is marked for assistive technology
 * too, not only by its look. An area's own page starts its stack over.
 *
 * UX-IA-022: an area with something new since the user last opened its
 * page has a badge with how many, in the link's name too. It is gone as
 * soon as the area's page is on its way.
 */
export function MainNavigation() {
  const pathname = usePathname();
  const stack = useStack();
  const root = areaAt(pathname);
  const pendingPath = usePendingPath();
  const { news } = useAttention();
  // The area whose own page is shown or on its way has nothing new.
  const opened = (pendingPath && areaAt(pendingPath)) || root;
  // An area being opened is marked at once (`NavigationProgress`). Under a
  // layer, the area stays the one the layer was opened over.
  const current =
    (pendingPath && areaAt(pendingPath)) ||
    (isStackOf(stack, pathname) || (stack && layerOf(pathname))
      ? stack!.area
      : (root ?? areaOf(pathname)));

  useEffect(() => {
    // Always here, the navigation hears of every address first.
    trackAddress();
    if (root) enterArea(root);
  }, [root, pathname]);

  return (
    <nav className="main-navigation bar-surface" aria-label="Hovedmeny">
      <ul>
        {areas.map((area) => {
          const count =
            isNewsArea(area.id) && area.id !== opened ? news[area.id] : 0;

          return (
            <li key={area.id}>
              <Link
                href={area.href}
                aria-current={area.id === current ? "page" : undefined}
              >
                <span className="navigation-icon">
                  <Icon name={area.id} />
                  {count > 0 && (
                    <span className="navigation-badge" aria-hidden="true">
                      {badgeCount(count)}
                    </span>
                  )}
                </span>
                <span>{area.label}</span>
                {count > 0 && (
                  <span className="visually-hidden">
                    , {count} {count === 1 ? "ny" : "nye"}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
