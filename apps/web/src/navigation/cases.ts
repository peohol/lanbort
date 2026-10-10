import { z } from "zod";
import { chatHref } from "./chat";
import type { SearchParams } from "./list-pages";
import { casesHref, environmentParam } from "./routes";

/**
 * The pages of cases (WP-88) beyond the case itself (`caseHref`) and the
 * list of own cases (`casesHref`): an environment's queue, and where a user
 * reports something or contacts the administrators.
 */

/** The cases of an environment its administrators handle (UX-IA-007). */
export const environmentCasesHref = (
  environmentId: string,
  status: "open" | "closed" = "open",
) =>
  `${casesHref}/miljo/${environmentId}${status === "closed" ? "?vis=lukkede" : ""}`;

/** Whether the queue page shows closed cases (`?vis=lukkede`). */
export const showsClosedCases = (params: SearchParams) =>
  params.vis === "lukkede";

/**
 * What can be reported, and the address parameter that names it: a person,
 * an object, a review about the reporter or the response to one they wrote.
 */
export const reportSubjects = {
  user: "person",
  object: "ting",
  review: "anmeldelse",
  review_response: "tilsvar",
} as const;

export type ReportSubjectKind = keyof typeof reportSubjects;

export interface ReportSubject {
  readonly kind: ReportSubjectKind;
  readonly id: string;
}

/**
 * How a new case starts: a member writes to an environment's administrators,
 * or a user reports something, to an environment's administrators (a
 * person or an object there) or to Lånbort's platform stewards.
 */
export type CaseStart =
  | { readonly kind: "contact"; readonly environmentId: string }
  | {
      readonly kind: "report";
      readonly environmentId: string | null;
      readonly subject: ReportSubject;
    };

/** Only a person or an object is reported to an environment (PS-TRUST-013). */
export const reportableInEnvironment = (kind: ReportSubjectKind) =>
  kind === "user" || kind === "object";

const newCasePath = `${casesHref}/ny`;
const contactParam = "kontakt";

export function newCaseHref(start: CaseStart): string {
  const params = new URLSearchParams();

  if (start.kind === "contact") {
    params.set(contactParam, start.environmentId);
  } else {
    if (start.environmentId) {
      params.set(environmentParam, start.environmentId);
    }
    params.set(reportSubjects[start.subject.kind], start.subject.id);
  }

  return `${newCasePath}?${params.toString()}`;
}

const id = (value: SearchParams[string]) =>
  typeof value === "string" && z.uuid().safeParse(value).success
    ? value.toLowerCase()
    : null;

/** The start a new-case address names, or null when it names none. */
export function parseCaseStart(params: SearchParams): CaseStart | null {
  const contact = id(params[contactParam]);

  if (contact) {
    return { kind: "contact", environmentId: contact };
  }

  const subjects = (
    Object.entries(reportSubjects) as [ReportSubjectKind, string][]
  ).flatMap(([kind, param]) => {
    const value = id(params[param]);
    return value ? [{ kind, id: value }] : [];
  });

  if (subjects.length !== 1) {
    return null;
  }

  const subject = subjects[0]!;
  const environmentId = id(params[environmentParam]);

  return {
    kind: "report",
    subject,
    environmentId:
      environmentId && reportableInEnvironment(subject.kind)
        ? environmentId
        : null,
  };
}

/**
 * Where a user tells Lånbort that someone may have died or be permanently
 * unavailable (PS-COM-015). Shown only where platform cases are.
 */
export const unavailabilityReportHref = (userId: string) =>
  `${casesHref}/mulig-dodsfall/${userId}`;

/**
 * The chat page where a participant chooses private messages to submit to
 * the case (WP-46). Chat pages read the device's own history, so this is
 * one of them (ADR-0010 §13).
 */
export const caseEvidenceHref = (caseId: string) => `${chatHref}/sak/${caseId}`;

/**
 * The notice to whoever a measure hits (PS-TRUST-018): what was done, where
 * and why, and where to ask for a new assessment.
 */
export const measureNoticeHref = (measureId: string) =>
  `${casesHref}/tiltak/${measureId}`;
