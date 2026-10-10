import type { MeasureNotice, MeasureNoticeKind } from "@lanbort/contracts";
import { dimensionLabel } from "./reviews";

/**
 * What the owner, author or member a measure hits is told (PS-TRUST-018,
 * PS-ENV-021): what was done, where it applies and what it means for them.
 * Never that there was a report, who sent it or who decided.
 */

/** The notification's sentence, before anything is opened. */
export const measureNoticeTitles: Record<MeasureNoticeKind, string> = {
  publication_rejected: "Publiseringen av tingen din er avvist i et miljø",
  publication_blocked: "Tingen din er sperret for publisering i et miljø",
  object_blocked: "Tingen din er sperret for nye lån",
  object_unblocked: "Sperren av tingen din er opphevet",
  review_removed: "Anmeldelsen din er fjernet",
  review_text_removed: "Teksten i anmeldelsen din er fjernet",
  review_score_removed: "En vurdering i anmeldelsen din er fjernet",
  review_response_removed: "Tilsvaret ditt er fjernet",
  membership_ended: "Medlemskapet ditt i et miljø er avsluttet",
};

/** Where the measure applies, in a sentence: the environment or Lånbort. */
const placeOf = (notice: MeasureNotice, environment: string | null) =>
  notice.scope === "platform" ? "Lånbort" : (environment ?? "miljøet");

/** The short state above the heading («Sperret i Borettslaget Lia»). */
export function measureNoticeLabel(
  notice: MeasureNotice,
  environment: string | null,
): string {
  const place = placeOf(notice, environment);
  const labels: Record<MeasureNoticeKind, string> = {
    publication_rejected: `Avvist i ${place}`,
    publication_blocked: `Sperret i ${place}`,
    object_blocked: "Sperret for nye lån",
    object_unblocked: "Sperren er opphevet",
    review_removed: "Fjernet",
    review_text_removed: "Tekst fjernet",
    review_score_removed: "Vurdering fjernet",
    review_response_removed: "Tilsvar fjernet",
    membership_ended: "Ikke lenger medlem",
  };

  return labels[notice.kind];
}

/** What was done, said where it applies. */
export function measureNoticeHeading(
  notice: MeasureNotice,
  environment: string | null,
): string {
  const place = placeOf(notice, environment);
  const headings: Record<MeasureNoticeKind, string> = {
    publication_rejected: `Publiseringen er avvist i ${place}`,
    publication_blocked: `Publiseringen er sperret i ${place}`,
    object_blocked: "Tingen er sperret for nye lån",
    object_unblocked: "Sperren av tingen er opphevet",
    review_removed: "Anmeldelsen er fjernet",
    review_text_removed: "Teksten i anmeldelsen er fjernet",
    review_score_removed: notice.dimension
      ? `Vurderingen «${dimensionLabel(notice.dimension)}» er fjernet`
      : "En vurdering i anmeldelsen er fjernet",
    review_response_removed: "Tilsvaret er fjernet",
    membership_ended: `Medlemskapet ditt i ${place} er avsluttet`,
  };

  return headings[notice.kind];
}

/** What it means for them, and what it leaves as it was. */
export function measureNoticeEffect(
  notice: MeasureNotice,
  environment: string | null,
): string {
  const place = placeOf(notice, environment);
  const elsewhere =
    "Andre steder gjelder det ikke, og lån som allerede er godkjent, går som før.";
  const effects: Record<MeasureNoticeKind, string> = {
    publication_rejected: `Tingen vises ikke i ${place}. Du kan publisere den der på nytt. ${elsewhere}`,
    publication_blocked: `Tingen kan ikke publiseres i ${place} igjen før en administrator opphever sperren. ${elsewhere}`,
    object_blocked:
      "Tingen kan ikke lånes ut på nye lån før Lånbort opphever sperren.",
    object_unblocked: "Tingen kan lånes ut igjen.",
    review_removed: "Anmeldelsen vises ikke lenger noe sted.",
    review_text_removed:
      "Teksten vises ikke lenger. Vurderingene i anmeldelsen står.",
    review_score_removed:
      "Den ene vurderingen vises ikke lenger. Resten av anmeldelsen står.",
    review_response_removed: "Teksten i tilsvaret vises ikke lenger.",
    membership_ended: `Tingene dine vises ikke lenger i ${place}, og forespørsler derfra som ikke var godkjent, er avsluttet. Lån som allerede er godkjent, går som før, og du ser fortsatt det du trenger i dem.`,
  };

  return effects[notice.kind];
}

/** What the page is about: the thing, the review or the environment. */
export function measureNoticeSubject(
  notice: MeasureNotice,
  environment: string | null,
): { title: string; kind: string } {
  if (notice.kind === "membership_ended") {
    return { title: environment ?? "Miljøet", kind: "Miljø" };
  }

  return notice.objectId === null
    ? { title: "Anmeldelsen din", kind: "Anmeldelse" }
    : { title: notice.objectTitle ?? "Tingen din", kind: "Ting" };
}
