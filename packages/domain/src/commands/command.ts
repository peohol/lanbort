import type { Database } from "@lanbort/database";
import type { Kysely, Transaction } from "kysely";
import type { z } from "zod";
import {
  type AccountStatus,
  type Actor,
  actorScope,
  anonymousActor,
} from "../actor";
import {
  authorize,
  authorizeActor,
  type Policy,
} from "../authorization/policy";
import { AuthorizationError, DomainError } from "../errors";
import { EventRecorder, writeEvents } from "../events/recorder";
import type { ConsumerRegistry } from "../outbox/consumer";
import {
  findCompleted,
  type IdempotencyClaim,
  idempotencyKeyPattern,
  requestHash,
  storeCompleted,
} from "./idempotency";

/** What a command needs from the running system. */
export interface DomainContext {
  readonly db: Kysely<Database>;
  readonly consumers: ConsumerRegistry;
  readonly clock?: () => Date;
}

export interface Loaded<R, C> {
  readonly resource: R;
  readonly context: C;
}

/**
 * A state-changing domain operation. Defining a command is the only way to
 * mutate domain data, and a command cannot be defined without a policy, so
 * every mutation passes the same authorization boundary (ADR-0002).
 */
export interface CommandDefinition<I, R, C, O> {
  readonly name: string;
  readonly input: z.ZodType<I>;
  /** JSON-safe result. Stored verbatim for idempotent replays. */
  readonly output: z.ZodType<O>;
  readonly policy: Policy<R, C>;
  /**
   * `required`: callers must send an idempotency key and retries return the
   * first result (PS-NFR-005). `none` is only for commands whose repetition
   * is harmless.
   */
  readonly idempotency: "required" | "none";
  /**
   * How the command holds the signed-in actor's own account row, which it
   * locks first (account rows come before everything else) and re-reads, so
   * its actor rules decide on the account's state as of the transaction
   * (PS-ADM-001): `share` (the default) for everything that builds on the
   * account, `change` for the few commands that change the account row
   * itself, so two of them on one account wait for each other instead of
   * deadlocking.
   */
  readonly actorAccount?: "share" | "change";
  /**
   * Loads the current state the policy decides on, inside the command's
   * transaction (lock rows here with `forUpdate()` where races matter).
   * Return null when the resource does not exist; the caller then receives the
   * same `not_found` denial as for a resource it may not see.
   */
  load(args: {
    tx: Transaction<Database>;
    actor: Actor;
    input: I;
    now: Date;
  }): Promise<Loaded<R, C> | null>;
  execute(args: {
    tx: Transaction<Database>;
    actor: Actor;
    input: I;
    resource: R;
    context: C;
    events: EventRecorder;
    now: Date;
  }): Promise<O>;
}

const commandNamePattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function defineCommand<I, R, C, O>(
  definition: CommandDefinition<I, R, C, O>,
): CommandDefinition<I, R, C, O> {
  if (!commandNamePattern.test(definition.name)) {
    throw new Error(`Invalid command name: ${definition.name}`);
  }

  return Object.freeze({ ...definition });
}

export interface CommandRequest {
  readonly actor: Actor;
  readonly input: unknown;
  readonly idempotencyKey?: string | undefined;
  readonly correlationId?: string | undefined;
}

export interface CommandResult<O> {
  readonly output: O;
  /** True when this is the stored result of an earlier identical request. */
  readonly replayed: boolean;
}

/** Parses untrusted input, reporting only the offending field paths. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues.map((issue) => issue.path.join(".") || "$"),
      ),
    ];

    throw new DomainError("invalid_input", "Invalid command input", fields);
  }

  return parsed.data;
}

function idempotencyClaim(
  command: CommandDefinition<unknown, unknown, unknown, unknown>,
  request: CommandRequest,
  input: unknown,
): IdempotencyClaim | undefined {
  if (command.idempotency === "none") {
    if (request.idempotencyKey !== undefined) {
      throw new DomainError(
        "invalid_input",
        `${command.name} does not support idempotency keys`,
        ["idempotencyKey"],
      );
    }

    return undefined;
  }

  const scope = actorScope(request.actor);

  if (scope === null) {
    // Stored results are namespaced per actor; without one there is nothing
    // to bind them to, and such commands always require a signed-in actor.
    throw new AuthorizationError(command.policy.action, "unauthenticated");
  }

  if (request.idempotencyKey === undefined) {
    throw new DomainError(
      "idempotency_key_required",
      `${command.name} requires an idempotency key`,
    );
  }

  if (!idempotencyKeyPattern.test(request.idempotencyKey)) {
    throw new DomainError("invalid_input", "Invalid idempotency key", [
      "idempotencyKey",
    ]);
  }

  return {
    scope,
    command: command.name,
    key: request.idempotencyKey,
    hash: requestHash(input),
  };
}

/**
 * Locks the signed-in actor's account row and returns the actor with the
 * account's current state. A lifecycle change locks the same row for its
 * change, so it either commits before the command (which then sees the new
 * state) or waits until the command has committed. Without the row the
 * actor is not signed in any more.
 */
async function lockActorAccount(
  tx: Transaction<Database>,
  actor: Actor,
  mode: "share" | "change",
): Promise<Actor> {
  if (actor.kind !== "user") {
    return actor;
  }

  const query = tx
    .selectFrom("app.users")
    .select("status")
    .where("id", "=", actor.userId);
  const row = await (
    mode === "change" ? query.forNoKeyUpdate() : query.forShare()
  ).executeTakeFirst();

  return row
    ? { ...actor, accountStatus: row.status as AccountStatus }
    : anonymousActor;
}

/**
 * The database refuses new activity for an account that no longer takes it
 * (`app.require_active_accounts`). The actor's own account is re-read under
 * lock first, so when the database refuses, it is another account the
 * command builds on: a conflict with that account's state.
 */
function isAccountRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23001" &&
    "constraint" in error &&
    error.constraint === "account_takes_new_activity"
  );
}

async function runTransaction<T>(
  db: Kysely<Database>,
  work: (tx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  try {
    return await db.transaction().execute(work);
  } catch (error) {
    if (isAccountRefusal(error)) {
      throw new DomainError(
        "conflict",
        "An account the command builds on takes no new activity",
      );
    }

    throw error;
  }
}

/**
 * Runs a command as one transaction:
 * actor rules → lock and re-read the actor's account → idempotency lookup →
 * actor rules again → load current state → resource rules → execute →
 * append events and outbox messages → store idempotent result.
 * Any failure rolls everything back, so there are no partial mutations
 * (PS-NFR-012).
 */
export async function executeCommand<I, R, C, O>(
  domain: DomainContext,
  command: CommandDefinition<I, R, C, O>,
  request: CommandRequest,
): Promise<CommandResult<O>> {
  const now = domain.clock?.() ?? new Date();

  authorizeActor(command.policy as Policy<never, never>, {
    actor: request.actor,
    now,
  });

  const input = parseInput(command.input, request.input);
  const claim = idempotencyClaim(
    command as CommandDefinition<unknown, unknown, unknown, unknown>,
    request,
    input,
  );

  return runTransaction(domain.db, async (tx) => {
    const actor = await lockActorAccount(
      tx,
      request.actor,
      command.actorAccount ?? "share",
    );

    if (claim) {
      const stored = await findCompleted(tx, claim);

      if (stored !== undefined) {
        return { output: command.output.parse(stored), replayed: true };
      }
    }

    authorizeActor(command.policy as Policy<never, never>, { actor, now });

    const loaded = await command.load({
      tx,
      actor,
      input,
      now,
    });

    if (!loaded) {
      throw new AuthorizationError(command.policy.action, "not_found");
    }

    authorize(command.policy, {
      actor,
      now,
      resource: loaded.resource,
      context: loaded.context,
    });

    const events = new EventRecorder();
    const output = command.output.parse(
      await command.execute({
        tx,
        actor,
        input,
        resource: loaded.resource,
        context: loaded.context,
        events,
        now,
      }),
    );

    await writeEvents(tx, events, {
      actor,
      correlationId: request.correlationId ?? null,
      consumers: domain.consumers,
    });

    if (claim) {
      await storeCompleted(tx, claim, output);
    }

    return { output, replayed: false };
  });
}
