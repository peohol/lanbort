import { randomUUID } from "node:crypto";
import {
  type CreateEnvironment,
  type OpenPlatformInquiry,
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
import { openPlatformInquiry } from "../platform/intervention-commands";
import { publishObject } from "../publications/commands";
import { publishToFriends } from "../publications/friends";
import { acceptFriendRequest, sendFriendRequest } from "../social/commands";
import { acquaint } from "./acquaintance";
import { registerTestUser } from "./identities";

const oneHour = 60 * 60 * 1000;
const oneDay = 24 * oneHour;

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

  /**
   * A platform steward whose session has the stronger authentication the
   * role needs, as a fresh passkey confirmation leaves it (ADR-0011;
   * `testing/stewards.ts` goes through the ceremonies themselves).
   */
  async function steward(): Promise<UserActor> {
    const actor = await user();
    await db
      .insertInto("app.platform_role_grants")
      .values({
        user_id: actor.userId,
        role: "platform_steward",
        granted_at: new Date(),
        granted_by_process: "ops.platform_roles",
        grant_reason: "Test",
      })
      .execute();

    return {
      ...actor,
      platformRoles: ["platform_steward"],
      authentication: { ...actor.authentication, assurance: "aal2" },
    };
  }

  /**
   * PS-ADM-015: the case a steward's interventions toward an account or a
   * thing are taken from, as the steward's own inquiry, which they hold.
   */
  async function inquiry(
    actor: UserActor,
    target: OpenPlatformInquiry["target"],
  ): Promise<string> {
    const { caseId } = await run(openPlatformInquiry, actor, {
      target,
      basis: "Grunnlag for inngrep",
    });

    return caseId;
  }

  const inquiries = new Map<string, Promise<string>>();

  /** The steward's one inquiry about the target, opened the first time. */
  function inquiryOnce(
    actor: UserActor,
    target: OpenPlatformInquiry["target"],
  ): Promise<string> {
    const key = `${actor.userId}:${JSON.stringify(target)}`;
    const opened = inquiries.get(key) ?? inquiry(actor, target);
    inquiries.set(key, opened);

    return opened;
  }

  const about = (actor: UserActor, userId: string) =>
    inquiryOnce(actor, { kind: "user", userId });
  const aboutObject = (actor: UserActor, objectId: string) =>
    inquiryOnce(actor, { kind: "object", objectId });

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
      await acquaint(db, admin, actor, clock);
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

  /** An owner makes the object visible to friends (PS-OBJ-020). */
  async function showToFriends(owner: UserActor, objectId: string) {
    await run(publishToFriends, owner, { objectId });
  }

  /**
   * An object of `owner`'s that their friend `borrower` can ask for
   * directly: they become friends, and it is visible to friends.
   */
  async function friendsObject(
    owner: UserActor,
    borrower: UserActor,
    loanTerms?: string,
  ) {
    await friends(borrower, owner);
    const objectId = await create(owner, loanTerms);
    await showToFriends(owner, objectId);

    return objectId;
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
    /**
     * Moves the clock `days` calendar days ahead in the product's time zone,
     * at about the same time of day. Days are 23 or 25 hours long when summer
     * time starts or ends, so a whole number of 24-hour days can land a day
     * short or a day too far.
     */
    advanceDays: (days: number) => {
      const target = addDays(calendarDate(clock), days);
      clock = new Date(clock.getTime() + days * oneDay);

      while (calendarDate(clock) < target) {
        clock = new Date(clock.getTime() + oneHour);
      }

      while (calendarDate(clock) > target) {
        clock = new Date(clock.getTime() - oneHour);
      }
    },
    run,
    user,
    steward,
    inquiry,
    about,
    aboutObject,
    environment,
    join,
    member,
    create,
    addCoOwner,
    friends,
    showToFriends,
    friendsObject,
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
