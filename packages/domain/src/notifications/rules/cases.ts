import type { NotificationKind, NotificationTarget } from "@lanbort/contracts";
import {
  caseAssigned,
  caseClosed,
  caseEntryAdded,
  caseOpened,
  caseRecused,
  caseReleased,
  caseRoundOpened,
  caseStatementsShared,
} from "../../cases/events";
import { sharedUpTo, visibleToParticipant } from "../../cases/model";
import {
  caseHandlers,
  findCase,
  findEntry,
  isCaseHandler,
  loadActions,
  loadParticipants,
} from "../../cases/store";
import { loanEndedUnresolved } from "../../loans/events";
import { type Db, notifyOn, type RuleInput, tell } from "../rule";

const caseTarget = (id: string): NotificationTarget => ({ type: "case", id });

/** Everyone taking part in the case: never the user a report is about. */
async function participantsOf(db: Db, caseId: string) {
  return (await loadParticipants(db, caseId)).map(({ userId }) => userId);
}

/**
 * The handlers who may take the case from the queue now. Nobody involved is
 * one (`app.case_handler`), so a report never reaches the user it is about.
 */
export async function waitingCase(db: Db, caseId: string, now: Date) {
  return tell(
    await caseHandlers(db, caseId, now),
    "case.waiting",
    caseTarget(caseId),
  );
}

/** The case's participants, told `kind`, while the case exists. */
const toParticipants =
  (kind: NotificationKind) =>
  async ({ db, event }: RuleInput<unknown>) =>
    tell(
      await participantsOf(db, event.resourceId),
      kind,
      caseTarget(event.resourceId),
    );

/** The handlers, told that the case is waiting in the queue again. */
const backInQueue = ({ db, event, now }: RuleInput<unknown>) =>
  waitingCase(db, event.resourceId, now);

/**
 * Notifications about administrative cases (WP-45, PS-COM-010–015). They
 * lead to the case, which only its participants and handlers can open, and
 * carry no code at all: never what was written, never why a handler can no
 * longer handle it. Each participant is told only what they may see there.
 */
export const caseRules = [
  // The other party of a mediation is part of it from the start, and the
  // handlers can take it.
  notifyOn(caseOpened, async (input) => [
    ...(await toParticipants("case.opened")(input)),
    ...(await backInQueue(input)),
  ]),
  // A participant's entry reaches the handler who has the case; a
  // handler's reaches the participants who see it (in a mediation, a
  // party's own statement only once the statements are shared).
  notifyOn(caseEntryAdded, async ({ db, event, payload, now }) => {
    const c = await findCase(db, event.resourceId);
    const entry = c && (await findEntry(db, c.id, payload.entryId));

    if (!c || !entry) {
      return [];
    }

    const shared = sharedUpTo(await loadActions(db, c.id));
    const readers = (await participantsOf(db, c.id)).filter((userId) =>
      visibleToParticipant(entry, userId, c.kind, shared),
    );
    const handler =
      c.assigneeUserId !== null &&
      (await isCaseHandler(db, c.id, c.assigneeUserId, now))
        ? [c.assigneeUserId]
        : [];

    return tell([...readers, ...handler], "case.entry_added", caseTarget(c.id));
  }),
  // The participants learn someone has their case; the handler it was
  // handed to learns it is theirs (taking it oneself is not told).
  notifyOn(caseAssigned, async (input) => [
    ...(await toParticipants("case.assigned")(input)),
    ...tell(
      [input.payload.assigneeUserId],
      "case.assigned_to_you",
      caseTarget(input.event.resourceId),
    ),
  ]),
  notifyOn(caseReleased, backInQueue),
  notifyOn(caseRecused, backInQueue),
  // Those who may write now: the round is theirs.
  notifyOn(caseRoundOpened, async ({ db, event }) =>
    tell(
      (await loadParticipants(db, event.resourceId))
        .filter(({ mayWrite }) => mayWrite)
        .map(({ userId }) => userId),
      "case.your_turn",
      caseTarget(event.resourceId),
    ),
  ),
  notifyOn(caseStatementsShared, toParticipants("case.statements_shared")),
  notifyOn(caseClosed, toParticipants("case.closed")),
  // Nobody ended it, so both parties are told, and the owners who are to
  // confirm having the object back (PS-LOAN-018–019).
  notifyOn(loanEndedUnresolved, async ({ db, event, payload }) => {
    const loan = await db
      .selectFrom("app.loans")
      .select(["borrower_user_id", "responsible_lender_id"])
      .where("id", "=", event.resourceId)
      .executeTakeFirst();
    const owners = await db
      .selectFrom("app.object_owners")
      .select("user_id")
      .where("object_id", "=", payload.objectId)
      .execute();

    return loan
      ? tell(
          [
            loan.borrower_user_id,
            loan.responsible_lender_id,
            ...owners.map(({ user_id }) => user_id),
          ],
          "loan.ended_unresolved",
          { type: "loan", id: event.resourceId },
        )
      : [];
  }),
];
