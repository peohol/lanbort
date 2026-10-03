"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaOf, areas } from "@/navigation/areas";
import { AreaIcon } from "./area-icon";

/**
 * UX-IA-001: the five areas. One list for every screen size: at the bottom
 * on a narrow screen, at the side on a wide one (globals.css), with the
 * same labels and order (UX-A11Y-001). The current area is marked for
 * assistive technology too, not only by its look.
 */
export function MainNavigation() {
  const current = areaOf(usePathname());

  return (
    <nav className="main-navigation" aria-label="Hovedmeny">
      <ul>
        {areas.map((area) => (
          <li key={area.id}>
            <Link
              href={area.href}
              aria-current={area.id === current ? "page" : undefined}
            >
              <AreaIcon area={area.id} />
              <span>{area.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
