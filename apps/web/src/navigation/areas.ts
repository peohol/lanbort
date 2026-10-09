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

/** The account context and the notification layer, outside the five areas. */
export const accountHref = "/konto";
export const notificationsHref = "/varsler";

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
