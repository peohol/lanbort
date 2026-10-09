/**
 * UX-IA-001: the five global areas, the same on mobile and desktop. Nothing
 * else gets a permanent place in the main navigation: notifications are a
 * layer (UX-IA-002), and the account opens from the avatar (UX-IA-003).
 */
export const areas = [
  { id: "home", label: "Hjem", href: "/" },
  { id: "find", label: "Finn", href: "/finn" },
  { id: "loans", label: "Lån", href: "/lan" },
  { id: "things", label: "Mine ting", href: "/mine-ting" },
  { id: "conversations", label: "Samtaler", href: "/samtaler" },
] as const;

export type AreaId = (typeof areas)[number]["id"];

const hrefOf = (id: AreaId) => areas.find((area) => area.id === id)!.href;

export const homeHref = hrefOf("home");
export const findHref = hrefOf("find");
export const thingsHref = hrefOf("things");
export const loansHref = hrefOf("loans");

/**
 * The account context and the notification centre: layers over the screen
 * the user is on, outside the five areas (UX-IA-002, UX-IA-020).
 */
export const layers = [
  { id: "account", label: "Konto", href: "/konto" },
  { id: "notifications", label: "Varsler", href: "/varsler" },
] as const;

export type LayerId = (typeof layers)[number]["id"];

export const layerById = (id: LayerId) =>
  layers.find((layer) => layer.id === id)!;

export const accountHref = layerById("account").href;
export const notificationsHref = layerById("notifications").href;

/** The layer a path lies in, if any: its own page or anything below it. */
export function layerOf(pathname: string): LayerId | null {
  return (
    layers.find(
      ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
    )?.id ?? null
  );
}

/** The area a path belongs to, if any: its own page or anything below it. */
export function areaOf(pathname: string): AreaId | null {
  const area = areas.find(({ href }) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`),
  );

  return area?.id ?? null;
}

/** The area whose own start page `pathname` is, if any. */
export function areaAt(pathname: string): AreaId | null {
  return areas.find(({ href }) => href === pathname)?.id ?? null;
}

export const areaById = (id: AreaId) => areas.find((area) => area.id === id)!;
