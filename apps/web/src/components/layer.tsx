"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { type LayerId, layerById } from "@/navigation/areas";
import { accountLayerHref } from "@/navigation/routes";
import { Icon } from "./icon";
import { closeLayer, scrollFor } from "./navigation-stack";

const LayerContext = createContext<LayerId | null>(null);

/** The layer the page is shown in, if any (UX-IA-020). */
export const useLayer = () => useContext(LayerContext);

/** Where a link inside a layer leads: some pages open inside it. */
const within: Record<LayerId, (href: string) => string | null> = {
  account: accountLayerHref,
  notifications: () => null,
};

/**
 * A layer over the screen the user is on (UX-IA-002, UX-IA-020): Konto and
 * Varsler. On a phone it covers the whole screen, the areas and the bell
 * too; on a larger screen it is a panel over the page. «Lukk», Escape and,
 * on a larger screen, a click beside the panel all return to exactly the
 * screen under it (`closeLayer`).
 *
 * Opened from the app, the layer lies `over` the screen, which is kept as
 * it was and shut off from the keyboard and assistive technology until the
 * layer closes; focus then returns to what opened it. Reached from outside,
 * the layer is the page itself, with nothing under it.
 */
export function Layer({
  layer,
  over,
  children,
}: {
  layer: LayerId;
  over: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const { label, href } = layerById(layer);
  const close = useCallback(
    () => closeLayer((href) => router.push(href, { scroll: false })),
    [router],
  );

  // Escape closes the layer wherever focus is, also on a layer loaded as
  // the page, but in a dialog inside it only that dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        (event.target instanceof Element && event.target.closest("dialog"))
      ) {
        return;
      }
      event.preventDefault();
      close();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (!over) return;

    const shell = document.querySelector(".app-shell");
    // What opened the layer: the focused control, or the shell's own link
    // to the layer where a tap focused nothing.
    const opener =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : shell?.querySelector<HTMLElement>(`a[href="${href}"]`);
    shell?.setAttribute("inert", "");

    return () => {
      shell?.removeAttribute("inert");
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [over, href]);

  // Each page opened in the layer is read from its title; a layer reached
  // from outside starts where any page does.
  const opened = useRef(over);
  useEffect(() => {
    const title = panel.current?.querySelector<HTMLElement>("h1");
    if (!opened.current) {
      opened.current = true;
      return;
    }
    if (!title) return;
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }, [pathname]);

  // A plain click on a link stays in the layer where the page opens in it,
  // and leaves the page under the layer where it was.
  function onClickCapture(event: MouseEvent) {
    const link = (event.target as Element).closest("a[href]");
    if (
      !(link instanceof HTMLAnchorElement) ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.target ||
      link.origin !== location.origin
    ) {
      return;
    }

    const address = `${link.pathname}${link.search}${link.hash}`;
    const href = within[layer](address) ?? address;
    const options = scrollFor(href);
    if (options.scroll) return;

    event.preventDefault();
    event.stopPropagation();
    router.push(href, options);
  }

  return (
    <LayerContext value={layer}>
      <div className="layer-backdrop" aria-hidden="true" onClick={close} />
      <div
        ref={panel}
        className="layer"
        {...(over && {
          role: "dialog",
          "aria-modal": true,
          "aria-label": label,
        })}
        onClickCapture={onClickCapture}
      >
        <div className="layer-header">
          <button
            type="button"
            className="layer-close"
            aria-label={`Lukk ${label}`}
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="layer-content">{children}</div>
      </div>
    </LayerContext>
  );
}
