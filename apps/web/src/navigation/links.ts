/**
 * The link a click follows inside the app, in this tab: a plain click with
 * the main button on a link to Lånbort itself. Null for anything the
 * browser handles on its own, such as a new tab, a download or another
 * site.
 */
export function followedLink(event: MouseEvent): HTMLAnchorElement | null {
  const link =
    event.target instanceof Element ? event.target.closest("a[href]") : null;

  if (
    !(link instanceof HTMLAnchorElement) ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (link.target && link.target !== "_self") ||
    link.hasAttribute("download") ||
    link.origin !== location.origin
  ) {
    return null;
  }

  return link;
}

/**
 * Whether the link takes the place of the page it is on in the history.
 * Next.js keeps a link's `replace` to itself, so such a link also says so
 * here, for when it is followed as a new document (`HeaderBoundary`).
 */
export const replacesPage = (link: HTMLAnchorElement) =>
  link.dataset.history === "replace";
