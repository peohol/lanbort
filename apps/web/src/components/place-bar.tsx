"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { areaById } from "@/navigation/areas";
import {
  backOf,
  type DirectEntry,
  isStackOf,
  type Place,
  ruleStack,
  trail,
} from "@/navigation/stack";
import { Icon } from "./icon";
import { enterPlace, enterTask, useStack } from "./navigation-stack";

const directEntryLabels: Record<DirectEntry, string> = {
  varsel: "Åpnet fra varsel",
  epost: "Åpnet fra e-post",
};

/** Where this page is, without its address: the browser adds that. */
export type PagePlace = Omit<Place, "href">;

/**
 * The way back along the navigation stack (UX-IA-009–011): on a phone one
 * step back, named after where it leads, and on a larger screen the whole
 * stack as breadcrumbs, each step a link. Until the browser knows the
 * stack, and for a page reached from outside, the stack is built from the
 * page's place by the rule. A direct entry is marked as one until the user
 * moves on.
 */
export function PlaceBar({ place }: { place: PagePlace }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const stack = useStack();
  const shown = isStackOf(stack, pathname)
    ? stack!
    : ruleStack({ ...place, href: pathname }, null);
  const back = backOf(shown);
  const steps = trail(shown);

  useEffect(() => {
    enterPlace({ ...place, href: `${pathname}${search ? `?${search}` : ""}` });
    // The place's parts, not the object, decide whether the page changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, place.label, place.home, place.container?.href]);

  return (
    <div className="place-bar">
      <Link className="back-link" href={back.href}>
        <Icon name="back" /> {back.label}
      </Link>
      <nav className="breadcrumbs" aria-label="Du er her">
        <ol>
          {steps.map((step, index) =>
            index === steps.length - 1 ? (
              <li key={step.href} aria-current="page">
                {step.label}
              </li>
            ) : (
              <li key={step.href}>
                <Link href={step.href}>{step.label}</Link>
              </li>
            ),
          )}
        </ol>
      </nav>
      {shown.via && (
        <span className="direct-entry">{directEntryLabels[shown.via]}</span>
      )}
    </div>
  );
}

/**
 * The way out of a form (UX-IA-013): «Avbryt» leads back to where the form
 * was started, which stays the top of the stack while the form is open. A
 * form opened from outside starts from `from`, its page by the rule.
 */
export function TaskBar({ from }: { from: Place }) {
  const stack = useStack();
  const pathname = usePathname();

  useEffect(() => {
    enterTask(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, from.href]);

  const area = stack && areaById(stack.area);
  const top = stack?.entries.at(-1) ?? (area && { href: area.href });
  const href = top?.href ?? from.href;

  return (
    <div className="place-bar">
      <Link className="back-link task-cancel" href={href}>
        <Icon name="close" /> Avbryt
      </Link>
    </div>
  );
}
