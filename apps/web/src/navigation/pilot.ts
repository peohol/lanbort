/**
 * The closed pilot's own workspace (docs/implementation/pilot-ui.md), apart
 * from the app's areas: the lead's pages, and a participant's own tasks.
 */
export const pilotHref = "/pilot";

export const pilotTestHref = (testId: string) =>
  `${pilotHref}/tester/${encodeURIComponent(testId)}`;

export const pilotDefectsHref = `${pilotHref}/feil`;

export const pilotParticipantsHref = `${pilotHref}/deltakere`;

export const pilotReportHref = `${pilotHref}/rapport`;

export const pilotCampaignHref = `${pilotHref}/kampanje`;

export const pilotTasksHref = `${pilotHref}/oppgaver`;

/** The lead's pages, in the order the pilot's own menu shows them. */
export const pilotLeadPages = [
  { href: pilotHref, label: "Oversikt" },
  { href: pilotDefectsHref, label: "Feil" },
  { href: pilotParticipantsHref, label: "Deltakere" },
  { href: pilotReportHref, label: "Rapport" },
  { href: pilotCampaignHref, label: "Kampanje" },
] as const;
