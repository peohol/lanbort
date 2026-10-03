import type {
  NotificationTarget,
  NotificationTargetType,
} from "@lanbort/contracts";
import { accountHref } from "./areas";

/**
 * Where a notification or a Home item leads (UX-IA-002: to the context,
 * never a copy of it): the page that shows the target, at its own entry.
 * One place decides, so a context that gets its own page later changes only
 * its line here. Null: no page shows it yet.
 */
const targetPages: Record<
  NotificationTargetType,
  { page: string; anchor: (id: string) => string } | null
> = {
  loan: { page: "/lan", anchor: (id) => `lan-${id}` },
  loan_request: { page: "/lan", anchor: (id) => `foresporsel-${id}` },
  object_invitation: { page: "/mine-ting", anchor: (id) => `invitasjon-${id}` },
  user: { page: accountHref, anchor: () => "venner" },
  environment: null,
};

export function hrefFor(target: NotificationTarget): string | null {
  const place = targetPages[target.type];

  return place && `${place.page}#${place.anchor(target.id)}`;
}

/** The element id of the target's own entry on its page. */
export function anchorFor(type: NotificationTargetType, id: string): string {
  return targetPages[type]?.anchor(id) ?? id;
}
