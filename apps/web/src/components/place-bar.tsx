"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { areaById, type LayerId, layerOf } from "@/navigation/areas";
import {
  backOf,
  type DirectEntry,
  isStackOf,
  layerBackOf,
  type Place,
  ruleStack,
  trail,
} from "@/navigation/stack";
import { Icon } from "./icon";
import { useLayer } from "./layer";
import {
  enterLayerPlace,
  enterPlace,
  enterTask,
  screenUnder,
  useLayerStack,
  useStack,
} from "./navigation-stack";

const directEntryLabels: Record<DirectEntry, string> = {
  varsel: "Åpnet fra varsel",
  epost: "Åpnet fra e-post",
};

/** Where this page is, without its address: the browser adds that. */
export type PagePlace = Omit<Place, "href">;

/**
 * The page's own address. While a layer lies over the page, the browser
 * shows the layer's address; the page stays where it was.
 */
function useOwnAddress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const address = `${pathname}${search ? `?${search}` : ""}`;
  const covered = layerOf(pathname) !== null;
  // A page first shown under a layer, as after the browser's back into it,
  // is the screen the layer lies over.
  const [own, setOwn] = useState(() =>
    covered ? (screenUnder()?.href ?? address) : address,
  );

  if (!covered && own !== address) setOwn(address);

  return { address: covered ? own : address, covered };
}

/**
 * Where the page is (UX-IA-009–011, UX-IA-020). In a layer, a step in the
 * layer's own stack; elsewhere, for a page that lies somewhere (`located`),
 * the way back along the navigation stack.
 */
export function PlaceBar({
  place,
  located = true,
}: {
  place: PagePlace;
  /** False for an area's own page, which lies nowhere but in a layer. */
  located?: boolean;
}) {
  const layer = useLayer();

  if (layer) return <LayerBar layer={layer} label={place.label} />;
  return located ? <StackBar place={place} /> : null;
}

/**
 * The way back along the navigation stack: on a phone one step back, named
 * after where it leads, and on a larger screen the whole stack as
 * breadcrumbs, each step a link. Until the browser knows the stack, and for
 * a page reached from outside, the stack is built from the page's place by
 * the rule. A direct entry is marked as one until the user moves on.
 */
function StackBar({ place }: { place: PagePlace }) {
  const { address, covered } = useOwnAddress();
  const path = address.split("?", 1)[0]!;
  const stack = useStack();
  const shown = isStackOf(stack, path)
    ? stack!
    : ruleStack({ ...place, href: path }, null);
  const back = backOf(shown);
  const steps = trail(shown);

  useEffect(() => {
    if (!covered) enterPlace({ ...place, href: address });
    // The place's parts, not the object, decide whether the page changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, covered, place.label, place.home, place.container?.href]);

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
 * A step in a layer's own stack (UX-IA-020): the way back within the
 * layer, named after where it leads («‹ Venner»), on every screen size.
 * The layer's first page has none; «Lukk» is the layer's own.
 */
function LayerBar({ layer, label }: { layer: LayerId; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = `${pathname}${search ? `?${search}` : ""}`;
  const stack = useLayerStack();
  const back = stack && layerBackOf(stack, pathname);

  useEffect(() => {
    enterLayerPlace(layer, { href, label });
  }, [layer, href, label]);

  return (
    back && (
      <div className="place-bar">
        <Link className="back-link layer-back" href={back.href}>
          <Icon name="back" /> {back.label}
        </Link>
      </div>
    )
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
    // Under a layer the form stays where it was.
    if (layerOf(pathname) === null) enterTask(from);
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
