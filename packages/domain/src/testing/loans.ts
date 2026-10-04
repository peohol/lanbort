import { randomUUID } from "node:crypto";
import {
  type CreateEnvironment,
  responsibilityDeclarationVersion,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor, UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { createEnvironment } from "../environment/environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
} from "../environment/membership-commands";
import { approveLoanRequest } from "../loans/approval";
import { createLoanRequest } from "../loans/commands";
import { addDays, calendarDate } from "../objects/availability";
import { acceptCoOwnerInvitation, inviteCoOwner } from "../objects/co-owners";
import { createObject } from "../objects/commands";
import { ConsumerRegistry } from "../outbox/consumer";
import { publishObject } from "../publications/commands";
import { acceptFriendRequest, sendFriendRequest } from "../social/commands";
import { registerTestUser } from "./identities";

/**
 * Midday in Norway, `days` from today. The clock starts there whenever the
 * tests run, so moving it whole days ahead (a daylight saving change
 * included) never crosses midnight and the calendar days the tests count
 * on are the ones they get.
 */
function middayIn(days: number): Date {
  return new Date(`${addDays(calendarDate(new Date()), days)}T10:00:00Z`);
}

/**
 * Shared steps for the loan integration tests (WP-30–WP-32): users,
 * environments, objects, co-owners, friendships and requests, made through
 * the real commands against the test database. Each command moves the clock
 * a millisecond ahead, so events and statuses keep their order.
 */
export function loanTestKit(
  db: Kysely<Database>,
  options: {
    consumers?: ConsumerRegistry;
    /**
     * How many days from today the clock starts. Test files share one
     * database and run at once, and the scheduled jobs act on every loan
     * that is due; a file whose waiting confirmations must stay waiting
     * starts its clock beyond where the other files move theirs.
     */
    startInDays?: number;
  } = {},
) {
  let clock = middayIn(options.startInDays ?? 0);
  const domain: DomainContext = {
    db,
    consumers: options.consumers ?? new ConsumerRegistry(),
    clock: () => clock,
  };
  const tick = () => {
    clock = new Date(clock.getTime() + 1);
    return domain;
  };

  function run<I, R, C, O>(
    command: CommandDefinition<I, R, C, O>,
    actor: Actor,
    input: object,
    idempotencyKey: string = randomUUID(),
  ): Promise<O> {
    tick();
    return executeCommand(domain, command, {
      actor,
      input,
      ...(command.idempotency === "none" ? {} : { idempotencyKey }),
    }).then((result) => result.output);
  }

  const user = async () => (await registerTestUser(domain)).actor;

  async function environment(
    owner: UserActor,
    input: Partial<CreateEnvironment> = {},
  ) {
    const { environmentId } = await run(createEnvironment, owner, {
      name: "Borettslaget",
      type: "open",
      ...input,
    });

    return environmentId;
  }

  /** Makes `actor` an active member: joining an open environment, invited otherwise. */
  async function join(
    environmentId: string,
    admin: UserActor,
    actor: UserActor,
  ) {
    const { type } = await db
      .selectFrom("app.environments")
      .select("type")
      .where("id", "=", environmentId)
      .executeTakeFirstOrThrow();

    if (type === "open") {
      await run(joinEnvironment, actor, { environmentId, answers: [] });
    } else {
      await run(inviteMember, admin, { environmentId, userId: actor.userId });
      await run(acceptInvitation, actor, { environmentId, answers: [] });
    }

    return actor;
  }

  const member = async (environmentId: string, admin: UserActor) =>
    join(environmentId, admin, await user());

  /** An object available from today on, unless other intervals are given. */
  async function create(
    owner: UserActor,
    loanTerms?: string,
    availability: readonly object[] = [
      { start: calendarDate(clock), end: null },
    ],
  ) {
    const { objectId } = await run(createObject, owner, {
      title: "Tilhenger",
      categoryId: "annet",
      description: "Liten tilhenger med presenning.",
      ...(loanTerms === undefined ? {} : { loanTerms }),
      availability,
    });

    return objectId;
  }

  async function addCoOwner(
    owner: UserActor,
    objectId: string,
    other: UserActor,
  ) {
    const { invitationId } = await run(inviteCoOwner, owner, {
      objectId,
      userId: other.userId,
    });
    await run(acceptCoOwnerInvitation, other, { invitationId });
  }

  async function friends(a: UserActor, b: UserActor) {
    await run(sendFriendRequest, a, { userId: b.userId });
    await run(acceptFriendRequest, b, { userId: a.userId });
  }

  const versionOf = async (objectId: string) =>
    (
      await db
        .selectFrom("app.objects")
        .select("version")
        .where("id", "=", objectId)
        .executeTakeFirstOrThrow()
    ).version;

  /** An open environment with an owner whose object is published there. */
  async function published(input: Partial<CreateEnvironment> = {}) {
    const admin = await user();
    const environmentId = await environment(admin, input);
    const owner = await member(environmentId, admin);
    const borrower = await member(environmentId, admin);
    const objectId = await create(owner, "Må vaskes etter bruk.");
    const { publicationId } = await run(publishObject, owner, {
      objectId,
      environmentId,
    });

    return { admin, environmentId, owner, borrower, objectId, publicationId };
  }

  const environmentOrigin = (environmentId: string) => ({
    kind: "environment",
    environmentId,
  });

  /** A request as the borrower sends it after looking at the object now. */
  async function ask(
    borrower: UserActor,
    objectId: string,
    origin: object,
    input: object = {},
    idempotencyKey?: string,
  ) {
    const direct = (origin as { kind: string }).kind === "direct";

    return run(
      createLoanRequest,
      borrower,
      {
        objectId,
        origin,
        start: { kind: "asap" },
        end: { kind: "duration", days: 3 },
        message: "Kan jeg låne den til helgen?",
        termsVersion: await versionOf(objectId),
        ...(direct ? { responsibilityDeclarationVersion } : {}),
        ...input,
      },
      idempotencyKey,
    );
  }

  /** The calendar date `n` days from today. */
  const day = (n: number) => addDays(calendarDate(clock), n);

  /** A dated request from day `from` to day `to`, both inclusive. */
  const dated = (from: number, to: number) => ({
    start: { kind: "date", date: day(from) },
    end: { kind: "date", date: day(to) },
  });

  /**
   * A reserved loan: the owner of an object published in an environment
   * approves the borrower's request for days `from`–`to`.
   */
  async function reservedLoan(from = 2, to = 4) {
    const setup = await published();
    const { requestId } = await ask(
      setup.borrower,
      setup.objectId,
      environmentOrigin(setup.environmentId),
      dated(from, to),
    );
    const { loanId } = await run(approveLoanRequest, setup.owner, {
      requestId,
    });

    return { ...setup, requestId, loanId };
  }

  async function stored(requestId: string) {
    return db
      .selectFrom("app.loan_requests")
      .select(["status", "end_reason", "terms_version"])
      .where("id", "=", requestId)
      .executeTakeFirstOrThrow();
  }

  const eventsFor = (resourceType: string, resourceId: string) =>
    db
      .selectFrom("app.audit_events")
      .select(["event_type", "payload"])
      .where("resource_type", "=", resourceType)
      .where("resource_id", "=", resourceId)
      .orderBy("position")
      .execute();

  return {
    domain,
    tick,
    /** The clock commands run at. */
    now: () => clock,
    /** Moves the clock `ms` ahead. */
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
    run,
    user,
    environment,
    join,
    member,
    create,
    addCoOwner,
    friends,
    versionOf,
    published,
    environmentOrigin,
    ask,
    day,
    dated,
    reservedLoan,
    stored,
    eventsFor,
  };
}
