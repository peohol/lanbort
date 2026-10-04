import type {
  LoanHistoryEntry,
  LoanHistoryEvent,
  LoanHistoryPerson,
} from "@lanbort/contracts";
import { formatPeriod } from "./dates";

/** Who did it, first in the sentence; Lånbort itself when nobody did. */
function subject(person: LoanHistoryPerson | null): string {
  if (!person) {
    return "Lånbort";
  }

  return person.you ? "Du" : named(person, "En medeier");
}

/** Someone later in the sentence. */
function object(person: LoanHistoryPerson): string {
  return person.you ? "deg" : named(person, "en medeier");
}

/**
 * The borrower and lenders by name; another co-owner only as a co-owner,
 * and a deleted account as a former user (UX-PRIV-010).
 */
function named(person: LoanHistoryPerson, coOwner: string): string {
  if (person.role === "co_owner") {
    return coOwner;
  }

  return person.realName ?? "Tidligere bruker";
}

/**
 * Whose statement it was: the actor, or, when Lånbort made a waiting
 * confirmation take effect, the side it belonged to.
 */
function speaker(entry: LoanHistoryEntry): string {
  if (entry.actor) {
    return subject(entry.actor);
  }

  if (entry.byCoOwner) {
    return "En medeier";
  }

  return entry.side === "lender" ? "Utlåneren" : "Låntakeren";
}

const period = (entry: LoanHistoryEntry) =>
  entry.period ? `: ${formatPeriod(entry.period)}` : "";

/**
 * UX-INT-008: each event as people would tell it, with who did it. Never
 * whose fault anything was: silence and disagreement are described as
 * what happened, nothing more (PS-LOAN-012–013).
 */
const texts: Record<
  LoanHistoryEvent,
  (entry: LoanHistoryEntry, title: string) => string
> = {
  requested: (entry) => `${subject(entry.actor)} sendte forespørselen`,
  terms_confirmed: (entry) => `${subject(entry.actor)} bekreftet vilkårene`,
  responsibility_accepted: (entry) =>
    `${subject(entry.actor)} godtok ansvarserklæringen`,
  reserved: (entry) => `${subject(entry.actor)} godkjente lånet`,
  cancelled: (entry) => `${subject(entry.actor)} avlyste lånet`,
  stopped: () =>
    "Lånet ble stoppet før overleveringen på grunn av en plattformbegrensning",
  amendment_proposed: (entry) =>
    `${subject(entry.actor)} foreslo ny periode${period(entry)}`,
  amendment_accepted: (entry) =>
    `${subject(entry.actor)} godtok ny periode${period(entry)}`,
  amendment_declined: (entry) =>
    `${subject(entry.actor)} sa nei til forslaget om ny periode`,
  amendment_withdrawn: (entry) =>
    `${subject(entry.actor)} trakk tilbake forslaget om ny periode`,
  handover_reported: (entry, title) =>
    entry.outcome === "not_handed_over"
      ? `${speaker(entry)} sa at ${title} ikke ble overlevert`
      : `${speaker(entry)} sa at ${title} ble overlevert`,
  handed_over: (_, title) => `${title} ble lånt ut`,
  handover_disputed: () => "Dere sa ulike ting om overleveringen",
  not_completed: (entry) =>
    entry.basis === "unanswered"
      ? "Lånet ble ikke gjennomført. Fristen for å svare om overleveringen gikk ut"
      : "Lånet ble ikke gjennomført. Begge sa at overleveringen ikke skjedde",
  return_reported: (entry, title) => {
    switch (entry.outcome) {
      case "still_has":
        return `${speaker(entry)} sa at ${title} ikke er levert tilbake ennå`;
      case "received":
        return `${speaker(entry)} bekreftet å ha fått tilbake ${title}`;
      case "not_received":
        return `${speaker(entry)} sa at ${title} ikke er kommet tilbake`;
      default:
        return `${speaker(entry)} sa at ${title} er levert tilbake`;
    }
  },
  returned: (entry, title) =>
    entry.early
      ? `${title} kom tilbake før avtalt tid, og resten av perioden ble ledig`
      : `${title} er levert tilbake, og lånet er avsluttet`,
  return_disputed: (entry) =>
    entry.reopened
      ? "En bekreftet retur ble motsagt senere, så lånet er åpnet igjen"
      : "Dere sa ulike ting om returen",
  responsibility_proposed: (entry) =>
    entry.transfer
      ? `${subject(entry.actor)} foreslo at ${object(entry.transfer.to)} blir ansvarlig utlåner`
      : `${subject(entry.actor)} foreslo ny ansvarlig utlåner`,
  responsibility_answered: (entry) =>
    entry.answeredAs === "recipient"
      ? `${subject(entry.actor)} godtok å bli ansvarlig utlåner`
      : `${subject(entry.actor)} godtok den nye ansvarlige utlåneren`,
  responsibility_transferred: (entry) =>
    entry.transfer
      ? `${subject(entry.transfer.to)} ble ansvarlig utlåner`
      : "Lånet fikk ny ansvarlig utlåner",
  responsibility_declined: (entry) =>
    `${subject(entry.actor)} sa nei til ny ansvarlig utlåner`,
  responsibility_withdrawn: (entry) =>
    `${subject(entry.actor)} trakk tilbake forslaget om ny ansvarlig utlåner`,
  ended_unresolved: () => "Lånet ble avsluttet uten avklaring",
  control_confirmed: (entry, title) =>
    `${subject(entry.actor)} bekreftet å ha ${title} igjen`,
};

/** The entry in words, for the loan whose title is `title`. */
export function describeHistoryEntry(
  entry: LoanHistoryEntry,
  title: string,
): string {
  return texts[entry.event](entry, title);
}
