import type {
  NotificationTarget,
  NotificationTargetType,
} from "@lanbort/contracts";
import { accountHref } from "./areas";
import { chatDevicesHref } from "./chat";
import { caseHref, loanHref } from "./routes";

interface Place {
  /** The page that shows the target. */
  readonly href: (id: string) => string;
  /** The element id of its entry in a list. */
  readonly anchor: (id: string) => string;
}

/** A target shown as an entry on a shared page, led to by its anchor. */
const entryOn = (page: string, anchor: (id: string) => string): Place => ({
  href: (id) => `${page}#${anchor(id)}`,
  anchor,
});

/**
 * Where a notification or a Home item leads (UX-IA-002: to the context,
 * never a copy of it): the page that shows the target, at its own entry.
 * One place decides, so a context that gets its own page later changes only
 * its line here. Null: no page shows it yet.
 */
const targetPages: Record<NotificationTargetType, Place | null> = {
  loan: { href: loanHref, anchor: (id) => `lan-${id}` },
  loan_request: entryOn("/lan", (id) => `foresporsel-${id}`),
  object_invitation: entryOn("/mine-ting", (id) => `invitasjon-${id}`),
  user: entryOn(accountHref, () => "venner"),
  environment: null,
  case: { href: caseHref, anchor: (id) => `sak-${id}` },
  object_question: null,
  object_subscription: null,
  chat_device: entryOn(chatDevicesHref, (id) => `enhet-${id}`),
};

export function hrefFor(target: NotificationTarget): string | null {
  return targetPages[target.type]?.href(target.id) ?? null;
}

/** The element id of the target's own entry in a list. */
export function anchorFor(type: NotificationTargetType, id: string): string {
  return targetPages[type]?.anchor(id) ?? id;
}
