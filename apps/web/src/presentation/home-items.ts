import type { HomeItem, HomeItemKind, HomeSection } from "@lanbort/contracts";
import { environmentCasesHref } from "@/navigation/cases";
import { hrefFor } from "@/navigation/targets";
import { formatDay, formatTime } from "./dates";

/**
 * UX-IA-016: each section says why it is there, the counted ones with how
 * many tasks they hold.
 */
export const homeSectionHeadings: Record<
  HomeSection,
  (count: number) => string
> = {
  awaiting_you: (count) => `${count} venter på deg`,
  upcoming: () => "Kommer",
  unresolved: () => "Uavklart",
  administration: (count) => `${count} som administrator`,
};

const name = (item: HomeItem) => item.title ?? "objektet";
const plural = (count: number | null, one: string, many: string) =>
  count === 1 ? one : many;

/**
 * What each item means for the user, in their words (UX-P04): what they can
 * do, or what the situation is. Never the internal status.
 */
const texts: Record<HomeItemKind, (item: HomeItem) => string> = {
  "loan_request.answer": (item) =>
    `Svar på forespørselen om å låne ${name(item)}`,
  "loan_request.confirm_terms": (item) =>
    `Vilkårene for ${name(item)} er endret. Bekreft dem for å holde forespørselen åpen`,
  "loan_request.accept_responsibility": (item) =>
    `Godta ansvarserklæringen for ${name(item)}`,
  "loan.answer_amendment": (item) =>
    `Svar på forslaget om ny periode for ${name(item)}`,
  "loan.answer_responsibility": (item) =>
    `Svar på hvem som skal være ansvarlig utlåner for ${name(item)}`,
  "loan.take_over_responsibility": (item) =>
    `Du kan overta ansvaret som utlåner for ${name(item)}`,
  "loan.report_handover": (item) => `Fortell om ${name(item)} ble overlevert`,
  "loan.report_return": (item) =>
    `Fortell om du har levert tilbake ${name(item)}`,
  "loan.confirm_return": (item) =>
    `Bekreft om du har fått tilbake ${name(item)}`,
  "loan.confirm_control": (item) =>
    `Bekreft at du har ${name(item)} igjen, så den kan lånes ut på nytt`,
  "loan.write_review": (item) =>
    `Skriv en anmeldelse etter lånet av ${name(item)}`,
  "social.answer_friend_request": (item) =>
    `${item.title ?? "Noen"} vil bli venn med deg`,
  "object.answer_co_owner_invitation": (item) =>
    `Du er invitert til å bli medeier av ${name(item)}`,
  "environment.answer_invitation": (item) => `Du er invitert til ${item.title}`,
  "environment.answer_requirements": (item) =>
    `${item.title} trenger svar fra deg for medlemskapet`,
  "environment.confirm_membership": (item) =>
    `Bekreft at du fortsatt vil bli med i ${item.title}`,
  "environment.answer_role_invitation": (item) =>
    `Du er spurt om å ta en rolle i ${item.title}`,
  "environment.answer_type_change": (item) =>
    `Svar på forslaget om nytt personvern i ${item.title}`,
  "loan.awaiting_handover": (item) =>
    `Overleveringen av ${name(item)} venter på svar fra den andre parten`,
  "loan.awaiting_return": (item) =>
    `Returen av ${name(item)} venter på svar fra den andre parten`,
  "loan.late": (item) => `${name(item)} er ikke levert tilbake ennå`,
  "loan.disputed": (item) =>
    `Dere har sagt ulike ting om ${name(item)}. Avklar det sammen`,
  "loan.mediation": (item) =>
    `Administratorene i miljøet ser på lånet av ${name(item)}`,
  "loan.handover": (item) =>
    item.role === "lender"
      ? `Du låner bort ${name(item)}`
      : `Du henter ${name(item)}`,
  "loan.return": (item) =>
    item.role === "lender"
      ? `Du får tilbake ${name(item)}`
      : `Du leverer tilbake ${name(item)}`,
  "environment.review_memberships": (item) =>
    `${item.count} ${plural(item.count, "innmelding venter", "innmeldinger venter")} i ${item.title}`,
  "environment.review_publications": (item) =>
    `${item.count} ${plural(item.count, "objekt venter", "objekter venter")} på godkjenning i ${item.title}`,
  "environment.claim_ownership": (item) =>
    `${item.title} mangler eier. Du kan melde at du vil overta`,
  "environment.handle_cases": (item) =>
    `${item.count} ${plural(item.count, "henvendelse venter", "henvendelser venter")} på svar i ${item.title}`,
  "environment.mediate_loans": (item) =>
    `${item.count} ${plural(item.count, "lån venter", "lån venter")} på mekling i ${item.title}`,
  "environment.review_reports": (item) =>
    `${item.count} ${plural(item.count, "rapport venter", "rapporter venter")} på vurdering i ${item.title}`,
};

/** The tasks that lead to an environment's case queue (UX-IA-007). */
const caseTasks: readonly HomeItemKind[] = [
  "environment.handle_cases",
  "environment.mediate_loans",
  "environment.review_reports",
];

/**
 * Where an item leads: its target's page, or for an environment's waiting
 * cases, the environment's queue (UX-IA-007).
 */
export const homeItemHref = (item: HomeItem): string | null =>
  caseTasks.includes(item.kind)
    ? environmentCasesHref(item.target.id)
    : hrefFor(item.target);

/** The item's text, and when it is about or must be done by. */
export function describeHomeItem(item: HomeItem): {
  text: string;
  when: string | null;
} {
  return {
    text: texts[item.kind](item),
    when: item.dueAt
      ? `Frist ${formatTime(item.dueAt)}`
      : item.day
        ? formatDay(item.day)
        : null,
  };
}
