import type {
  CaseActionKind,
  CaseAudience,
  CaseCapacity,
  CaseKind,
  CaseParticipantRole,
  CaseQueueReturnReason,
  CaseStatus,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import type {
  ActionRecord,
  CaseRecord,
  EntryRecord,
  ParticipantRecord,
} from "./model";

/**
 * Database access for administrative cases. Who may handle a case is one
 * rule in the database (`app.case_handler`), which also guards every row;
 * the domain reads the same rule rather than restating it.
 */
type Db = Kysely<Database>;

const caseRow = (caseId: string) =>
  sql`(select c from app.cases as c where c.id = ${caseId})`;

const caseColumns = [
  "c.id",
  "c.kind",
  "c.environment_id",
  "c.loan_id",
  "c.subject_user_id",
  "c.opened_by_user_id",
  "c.opened_at",
  "c.status",
  "c.assignee_user_id",
  "c.closed_at",
] as const;

function caseQuery(db: Db) {
  return db.selectFrom("app.cases as c").select(caseColumns);
}

type CaseRow = Awaited<
  ReturnType<ReturnType<typeof caseQuery>["execute"]>
>[number];

export function toCaseRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    kind: row.kind as CaseKind,
    environmentId: row.environment_id,
    loanId: row.loan_id,
    subjectUserId: row.subject_user_id,
    openedByUserId: row.opened_by_user_id,
    openedAt: row.opened_at,
    status: row.status as CaseStatus,
    assigneeUserId: row.assignee_user_id,
    closedAt: row.closed_at,
  };
}

/** The case, with `lock` locked for the rest of the transaction. */
export async function findCase(
  db: Db,
  caseId: string,
  options: { lock?: boolean } = {},
): Promise<CaseRecord | null> {
  const query = caseQuery(db).where("c.id", "=", caseId);
  const row = await (
    options.lock ? query.forUpdate() : query
  ).executeTakeFirst();

  return row ? toCaseRecord(row) : null;
}

/** What makes an open case unique for its kind (the partial unique indexes). */
export type OpenCaseKey =
  | {
      readonly kind: "environment_contact";
      readonly environmentId: string;
      readonly userId: string;
    }
  | { readonly kind: "loan_mediation"; readonly loanId: string }
  | {
      readonly kind: "unavailability_report";
      readonly userId: string;
      readonly subjectUserId: string;
    };

/** The open case of the key, locked, if there is one. */
export async function findOpenCase(
  db: Db,
  key: OpenCaseKey,
): Promise<CaseRecord | null> {
  let query = caseQuery(db)
    .where("c.kind", "=", key.kind)
    .where("c.status", "=", "open");

  switch (key.kind) {
    case "environment_contact":
      query = query
        .where("c.environment_id", "=", key.environmentId)
        .where("c.opened_by_user_id", "=", key.userId);
      break;
    case "loan_mediation":
      query = query.where("c.loan_id", "=", key.loanId);
      break;
    case "unavailability_report":
      query = query
        .where("c.opened_by_user_id", "=", key.userId)
        .where("c.subject_user_id", "=", key.subjectUserId);
      break;
  }

  const row = await query.forUpdate().executeTakeFirst();

  return row ? toCaseRecord(row) : null;
}

export async function loadParticipants(
  db: Db,
  caseId: string,
): Promise<ParticipantRecord[]> {
  const rows = await db
    .selectFrom("app.case_participants")
    .select(["user_id", "role", "may_write"])
    .where("case_id", "=", caseId)
    .orderBy("joined_at")
    .orderBy("user_id")
    .execute();

  return rows.map((row) => ({
    userId: row.user_id,
    role: row.role as CaseParticipantRole,
    mayWrite: row.may_write,
  }));
}

export async function loadEntries(
  db: Db,
  caseId: string,
): Promise<EntryRecord[]> {
  const rows = await db
    .selectFrom("app.case_entries")
    .select([
      "id",
      "author_user_id",
      "capacity",
      "audience",
      "audience_user_id",
      "body",
      "corrects_entry_id",
      "created_at",
      "position",
    ])
    .where("case_id", "=", caseId)
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    authorUserId: row.author_user_id,
    capacity: row.capacity as CaseCapacity,
    audience: row.audience as CaseAudience,
    audienceUserId: row.audience_user_id,
    body: row.body,
    correctsEntryId: row.corrects_entry_id,
    createdAt: row.created_at,
    position: BigInt(row.position),
  }));
}

export async function loadActions(
  db: Db,
  caseId: string,
): Promise<ActionRecord[]> {
  const rows = await db
    .selectFrom("app.case_actions")
    .select([
      "kind",
      "actor_user_id",
      "target_user_id",
      "reason",
      "at",
      "position",
    ])
    .where("case_id", "=", caseId)
    .orderBy("position")
    .execute();

  return rows.map((row) => ({
    kind: row.kind as CaseActionKind,
    actorUserId: row.actor_user_id,
    targetUserId: row.target_user_id,
    reason: row.reason as CaseQueueReturnReason | null,
    at: row.at,
    position: BigInt(row.position),
  }));
}

/** Where `userId` stands as a possible handler of the case. */
export interface HandlerStanding {
  /** Holds the role that handles cases of its kind and context. */
  readonly holdsRole: boolean;
  /** Is involved in it, and so can never handle it (PS-USR-009). */
  readonly involved: boolean;
}

export async function loadHandlerStanding(
  db: Db,
  caseId: string,
  userId: string,
  now: Date,
): Promise<HandlerStanding> {
  const { rows } = await sql<{ holds_role: boolean; involved: boolean }>`
    select
      app.case_handler_role(${caseRow(caseId)}, ${userId}, ${now}) as holds_role,
      app.case_involved(${caseRow(caseId)}, ${userId}) as involved
  `.execute(db);

  return {
    holdsRole: rows[0]?.holds_role ?? false,
    involved: rows[0]?.involved ?? false,
  };
}

/** Whether `userId` may handle the case now (`app.case_handler`). */
export async function isCaseHandler(
  db: Db,
  caseId: string,
  userId: string,
  now: Date,
): Promise<boolean> {
  const { rows } = await sql<{ handler: boolean }>`
    select app.case_handler(${caseRow(caseId)}, ${userId}, ${now}) as handler
  `.execute(db);

  return rows[0]?.handler ?? false;
}

/**
 * The responsible handler as of now: none once they can no longer handle
 * the case, also before the database has returned it to the queue (time
 * alone ends a membership's transition period).
 */
const currentAssignee = (now: Date) =>
  sql<string | null>`case
    when app.case_handler(c, c.assignee_user_id, ${now}) then c.assignee_user_id
  end`;

const hasHandler = (now: Date) => sql<boolean>`app.case_has_handler(c, ${now})`;

/** How the case's handling stands now. */
export async function loadHandlingState(
  db: Db,
  caseId: string,
  now: Date,
): Promise<{ assigneeUserId: string | null; handlerAvailable: boolean }> {
  const row = await db
    .selectFrom("app.cases as c")
    .select([
      currentAssignee(now).as("assignee"),
      hasHandler(now).as("available"),
    ])
    .where("c.id", "=", caseId)
    .executeTakeFirstOrThrow();

  return { assigneeUserId: row.assignee, handlerAvailable: row.available };
}

/**
 * Returns the case to the queue if its handler can no longer handle it
 * (`app.return_cases_to_queue`), so a command acts on who holds it now.
 */
export async function settleAssignment(
  db: Db,
  caseId: string,
  now: Date,
): Promise<void> {
  await sql`select app.return_cases_to_queue(array[${caseId}]::uuid[], ${now})`.execute(
    db,
  );
}

export async function insertCase(
  db: Db,
  values: {
    readonly kind: CaseKind;
    readonly environmentId: string | null;
    readonly loanId: string | null;
    readonly subjectUserId: string | null;
    readonly openedByUserId: string;
    readonly now: Date;
    readonly participants: readonly {
      readonly userId: string;
      readonly role: CaseParticipantRole;
    }[];
  },
): Promise<string> {
  const { id } = await db
    .insertInto("app.cases")
    .values({
      kind: values.kind,
      environment_id: values.environmentId,
      loan_id: values.loanId,
      subject_user_id: values.subjectUserId,
      opened_by_user_id: values.openedByUserId,
      opened_at: values.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("app.case_participants")
    .values(
      values.participants.map((participant) => ({
        case_id: id,
        user_id: participant.userId,
        role: participant.role,
        may_write: true,
        joined_at: values.now,
      })),
    )
    .execute();

  return id;
}

export async function insertEntry(
  db: Db,
  values: {
    readonly caseId: string;
    readonly authorUserId: string;
    readonly capacity: CaseCapacity;
    readonly audience: CaseAudience;
    readonly audienceUserId: string | null;
    readonly body: string;
    readonly correctsEntryId: string | null;
    readonly now: Date;
  },
): Promise<string> {
  const { id } = await db
    .insertInto("app.case_entries")
    .values({
      case_id: values.caseId,
      author_user_id: values.authorUserId,
      capacity: values.capacity,
      audience: values.audience,
      audience_user_id: values.audienceUserId,
      body: values.body,
      corrects_entry_id: values.correctsEntryId,
      created_at: values.now,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return id;
}

export async function findEntry(
  db: Db,
  caseId: string,
  entryId: string,
): Promise<EntryRecord | null> {
  return (
    (await loadEntries(db, caseId)).find((entry) => entry.id === entryId) ??
    null
  );
}

/** Lets participants write, or not: one of them, or all without `userId`. */
export async function setMayWrite(
  db: Db,
  caseId: string,
  mayWrite: boolean,
  userId?: string,
): Promise<void> {
  let query = db
    .updateTable("app.case_participants")
    .set({ may_write: mayWrite })
    .where("case_id", "=", caseId);

  if (userId !== undefined) {
    query = query.where("user_id", "=", userId);
  }

  await query.execute();
}

/**
 * Records a handler's action and the case's state after it: the responsible
 * handler after an assignment or a release, closed after closing.
 */
export async function recordAction(
  db: Db,
  values: {
    readonly caseId: string;
    readonly kind: Exclude<CaseActionKind, "returned_to_queue">;
    readonly actorUserId: string;
    readonly targetUserId?: string | null;
    readonly now: Date;
  },
): Promise<void> {
  await db
    .insertInto("app.case_actions")
    .values({
      case_id: values.caseId,
      kind: values.kind,
      actor_user_id: values.actorUserId,
      target_user_id: values.targetUserId ?? null,
      at: values.now,
    })
    .execute();

  const state =
    values.kind === "assigned"
      ? { assignee_user_id: values.targetUserId ?? null }
      : values.kind === "released"
        ? { assignee_user_id: null }
        : values.kind === "closed"
          ? { status: "closed", closed_at: values.now }
          : null;

  if (state) {
    await db
      .updateTable("app.cases")
      .set(state)
      .where("id", "=", values.caseId)
      .execute();
  }
}

/** The page of cases after `cursor`, newest first. */
export async function listCases(
  db: Db,
  filter: (query: ReturnType<typeof listQuery>) => ReturnType<typeof listQuery>,
  options: { cursor: string | undefined; pageSize: number; now: Date },
) {
  const rows = await filter(listQuery(db, options.now))
    .where(
      options.cursor === undefined
        ? sql<boolean>`true`
        : sql<boolean>`(c.opened_at, c.id) < (
            select opened_at, id from app.cases where id = ${options.cursor}
          )`,
    )
    .orderBy("c.opened_at", "desc")
    .orderBy("c.id", "desc")
    .limit(options.pageSize + 1)
    .execute();
  const items = rows.slice(0, options.pageSize).map((row) => ({
    record: toCaseRecord(row),
    assigneeUserId: row.current_assignee,
    handlerAvailable: row.handler_available,
  }));

  return {
    items,
    nextCursor:
      rows.length > options.pageSize ? (items.at(-1)?.record.id ?? null) : null,
  };
}

function listQuery(db: Db, now: Date) {
  return caseQuery(db).select([
    currentAssignee(now).as("current_assignee"),
    hasHandler(now).as("handler_available"),
  ]);
}

/** Only the cases `userId` may handle now. */
export const handledBy = (userId: string, now: Date) =>
  sql<boolean>`app.case_handler(c, ${userId}, ${now})`;

/**
 * Whether `userId` has a concrete relation to `otherUserId` to report from
 * (vision 06, «Melding om mulig dødsfall»): they are friends, a loan was
 * between them, they own an object together, or both are active members of
 * the same environment.
 */
export async function related(
  db: Db,
  userId: string,
  otherUserId: string,
): Promise<boolean> {
  const { rows } = await sql<{ related: boolean }>`
    select
      exists (
        select 1 from app.friendships
        where status = 'active'
          and user_low_id = least(${userId}::uuid, ${otherUserId}::uuid)
          and user_high_id = greatest(${userId}::uuid, ${otherUserId}::uuid)
      )
      or exists (
        select 1 from app.loans
        where (borrower_user_id = ${userId} and (
            responsible_lender_id = ${otherUserId} or ${otherUserId} = any(owner_ids_at_approval)
          ))
          or (borrower_user_id = ${otherUserId} and (
            responsible_lender_id = ${userId} or ${userId} = any(owner_ids_at_approval)
          ))
      )
      or exists (
        select 1
        from app.object_owners as own
        join app.object_owners as other on other.object_id = own.object_id
        where own.user_id = ${userId} and other.user_id = ${otherUserId}
      )
      or exists (
        select 1
        from app.environment_memberships as own
        join app.environment_memberships as other
          on other.environment_id = own.environment_id
        where own.user_id = ${userId}
          and other.user_id = ${otherUserId}
          and own.state = 'active'
          and other.state = 'active'
      ) as related
  `.execute(db);

  return rows[0]?.related ?? false;
}

/** Everyone who may handle the open case now (`app.case_handlers`). */
export async function caseHandlers(
  db: Db,
  caseId: string,
  now: Date,
): Promise<string[]> {
  const { rows } = await sql<{ user_id: string }>`
    select user_id from app.case_handlers(${caseId}, ${now}) as user_id
  `.execute(db);

  return rows.map((row) => row.user_id);
}
