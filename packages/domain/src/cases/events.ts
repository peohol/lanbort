import {
  caseAudienceSchema,
  caseCapacitySchema,
  caseKindSchema,
} from "@lanbort/contracts";
import { z } from "zod";
import { type EventKind, defineEvent } from "../events/catalog";

/**
 * Case events carry ids and codes only: never what was written, and never
 * the user a report is about. What a participant opens or writes explains
 * the case's course; what a handler does is administrative and must be
 * verifiable afterwards (`audit`). The case's own history
 * (`app.case_actions`) also holds what the database does by itself, such as
 * returning a case to the queue; later notifications (WP-40) read it there.
 */
const caseEvent = <Shape extends z.ZodRawShape>(
  type: string,
  kind: EventKind,
  extra: Shape,
) =>
  defineEvent({
    type: `case.${type}`,
    version: 1,
    kind,
    resourceType: "case",
    payload: z.strictObject({
      caseKind: caseKindSchema,
      environmentId: z.uuid().nullable(),
      ...extra,
    }),
  });

export const caseOpened = caseEvent("opened", "domain", {
  loanId: z.uuid().nullable(),
});

export const caseEntryAdded = caseEvent("entry_added", "domain", {
  entryId: z.uuid(),
  capacity: caseCapacitySchema,
  audience: caseAudienceSchema,
  correction: z.boolean(),
});

/** A handler took the case, or the one holding it handed it on. */
export const caseAssigned = caseEvent("assigned", "audit", {
  assigneeUserId: z.uuid(),
});

export const caseReleased = caseEvent("released", "audit", {});

export const caseRoundOpened = caseEvent("round_opened", "audit", {
  userId: z.uuid().nullable(),
});

export const caseStatementsShared = caseEvent("statements_shared", "audit", {});

export const caseRecused = caseEvent("recused", "audit", {});

export const caseClosed = caseEvent("closed", "audit", {});
