import { randomUUID } from "node:crypto";
import {
  type CreateEnvironment,
  type LoanRequestRole,
  responsibilityDeclarationVersion,
} from "@lanbort/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { type Actor, systemActor, type UserActor } from "../actor";
import {
  type CommandDefinition,
  type DomainContext,
  executeCommand,
} from "../commands/command";
import { executeQuery } from "../commands/query";
import { startEnvironmentWindDown } from "../environment/continuity-commands";
import { createEnvironment } from "../environment/environment-commands";
import {
  acceptInvitation,
  inviteMember,
  joinEnvironment,
  leaveEnvironment,
} from "../environment/membership-commands";
import { typeChangeProcess } from "../environment/policies";
import { typeChangeDays } from "../environment/privacy";
import {
  changeEnvironmentType,
  concludeTypeChanges,
  respondToTypeChange,
} from "../environment/type-change-commands";
import { addDays, calendarDate } from "../objects/availability";
import {
  acceptCoOwnerInvitation,
  inviteCoOwner,
  leaveObject,
} from "../objects/co-owners";
import { archiveObject, createObject, updateObject } from "../objects/commands";
import { consentToObjectDeletion } from "../objects/deletion";
import { ConsumerRegistry } from "../outbox/consumer";
import {
  approvePublication,
  publishObject,
  setObjectApproval,
  withdrawPublication,
} from "../publications/commands";
import {
  acceptFriendRequest,
  blockUser,
  removeFriend,
  sendFriendRequest,
} from "../social/commands";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import {
  acceptResponsibility,
  confirmLoanTerms,
  createLoanRequest,
  declineLoanRequest,
  withdrawLoanRequest,
} from "./commands";
import {
  listLoanRequests,
  previewLoanRequest,
  readLoanRequest,
} from "./queries";

const db = connectTestDatabase();
afterAll(() => db.destroy());

let clock = new Date();
const domain: DomainContext = {
  db,
  consumers: new ConsumerRegistry(),
  clock: () => clock,
};
const tick = () => {
  clock = new Date(clock.getTime() + 1);
  return domain;
};
const passDays = (days: number) => {
  clock = new Date(clock.getTime() + days * 86_400_000 + 1000);
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

const notFound = { code: "not_found" };
const forbidden = { code: "forbidden" };
const conflict = { code: "conflict" };
const invalid = { code: "invalid_input" };

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
async function join(environmentId: string, admin: UserActor, actor: UserActor) {
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

async function create(owner: UserActor, loanTerms?: string) {
  const { objectId } = await run(createObject, owner, {
    title: "Tilhenger",
    categoryId: "annet",
    description: "Liten tilhenger med presenning.",
    ...(loanTerms === undefined ? {} : { loanTerms }),
    availability: [{ start: calendarDate(clock), end: null }],
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

const read = (actor: UserActor, requestId: string) =>
  executeQuery(tick(), readLoanRequest, { actor, input: { requestId } });

async function listed(actor: UserActor, role: LoanRequestRole) {
  const { requests } = await executeQuery(tick(), listLoanRequests, {
    actor,
    input: { role },
  });

  return requests.map((request) => request.id);
}

async function stored(requestId: string) {
  return db
    .selectFrom("app.loan_requests")
    .select(["status", "end_reason", "terms_version"])
    .where("id", "=", requestId)
    .executeTakeFirstOrThrow();
}

const eventsFor = (requestId: string) =>
  db
    .selectFrom("app.audit_events")
    .select(["event_type", "payload"])
    .where("resource_type", "=", "loan_request")
    .where("resource_id", "=", requestId)
    .orderBy("position")
    .execute();

const ended = (reason: string) => ({ status: "ended", end_reason: reason });

describe("a request through an environment (PS-LOAN-001/004)", () => {
  it("keeps its origin and what was asked for, and shows it to both sides", async () => {
    const { environmentId, owner, borrower, objectId, publicationId } =
      await published();
    const today = calendarDate(clock);

    const preview = await executeQuery(tick(), previewLoanRequest, {
      actor: borrower,
      input: { objectId, environmentId },
    });
    expect(preview).toMatchObject({
      objectId,
      loanTerms: "Må vaskes etter bruk.",
      termsVersion: await versionOf(objectId),
      availableForNewLoans: true,
      responsibilityDeclarationVersion: null,
    });

    const { requestId, status } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
      {
        start: { kind: "date", date: addDays(today, 2) },
        end: { kind: "date", date: addDays(today, 4) },
      },
    );
    expect(status).toBe("requested");

    const row = await db
      .selectFrom("app.loan_requests")
      .select(["origin", "environment_id", "publication_id", "position"])
      .where("id", "=", requestId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      origin: "environment",
      environment_id: environmentId,
      publication_id: publicationId,
    });
    expect(row.position).not.toBeNull();

    const asBorrower = await read(borrower, requestId);
    expect(asBorrower).toMatchObject({
      role: "borrower",
      origin: {
        kind: "environment",
        environment: { id: environmentId, name: "Borettslaget" },
      },
      start: { kind: "date", date: addDays(today, 2) },
      end: { kind: "date", date: addDays(today, 4) },
      status: "requested",
      confirmedTerms: { loanTerms: "Må vaskes etter bruk." },
      pendingTerms: null,
      responsibility: null,
    });
    expect((await read(owner, requestId)).role).toBe("lender");
    expect(await listed(borrower, "borrower")).toContain(requestId);
    expect(await listed(owner, "lender")).toEqual([requestId]);
    expect(await listed(owner, "borrower")).toEqual([]);

    expect(await eventsFor(requestId)).toEqual([
      {
        event_type: "loan_request.created",
        payload: {
          objectId,
          origin: "environment",
          environmentId,
          termsVersion: await versionOf(objectId),
        },
      },
    ]);
  });

  it("is retry-safe: the same key makes one request", async () => {
    const { environmentId, borrower, objectId } = await published();
    const key = randomUUID();
    const origin = environmentOrigin(environmentId);

    const first = await ask(borrower, objectId, origin, {}, key);
    const again = await ask(borrower, objectId, origin, {}, key);

    expect(again).toEqual(first);
    expect(await listed(borrower, "borrower")).toEqual([first.requestId]);
  });

  it("is not found by anyone who does not find the object there", async () => {
    const { admin, environmentId, owner, objectId } = await published();
    const outsider = await user();
    const hiddenAdmin = await user();
    const hidden = await environment(hiddenAdmin, { type: "hidden" });
    await join(hidden, hiddenAdmin, owner);
    const hiddenObject = await create(owner);
    await run(publishObject, owner, {
      objectId: hiddenObject,
      environmentId: hidden,
    });
    const unpublished = await create(owner);
    const otherMember = await member(environmentId, admin);

    for (const [actor, object, env] of [
      [outsider, objectId, environmentId],
      [outsider, hiddenObject, hidden],
      [outsider, objectId, randomUUID()],
      [otherMember, unpublished, environmentId],
      [otherMember, hiddenObject, environmentId],
    ] as const) {
      await expect(
        ask(actor, object, environmentOrigin(env)),
      ).rejects.toMatchObject(notFound);
      await expect(
        executeQuery(tick(), previewLoanRequest, {
          actor,
          input: { objectId: object, environmentId: env },
        }),
      ).rejects.toMatchObject(notFound);
    }

    await expect(
      ask(owner, objectId, environmentOrigin(environmentId)),
    ).rejects.toMatchObject(forbidden);
  });

  it("asks for a period within the object's actual availability", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const today = calendarDate(clock);
    const origin = environmentOrigin(environmentId);

    await expect(
      ask(borrower, objectId, origin, {
        start: { kind: "date", date: addDays(today, -1) },
      }),
    ).rejects.toMatchObject({ ...invalid, fields: ["start"] });
    await expect(
      ask(borrower, objectId, origin, {
        start: { kind: "date", date: addDays(today, 3) },
        end: { kind: "date", date: addDays(today, 2) },
      }),
    ).rejects.toMatchObject(invalid);

    await run(updateObject, owner, {
      objectId,
      expectedVersion: await versionOf(objectId),
      availability: [{ start: today, end: addDays(today, 5) }],
    });

    await expect(
      ask(borrower, objectId, origin, {
        start: { kind: "date", date: addDays(today, 4) },
        end: { kind: "duration", days: 3 },
      }),
    ).rejects.toMatchObject({ ...conflict, fields: ["start"] });
    expect(
      (
        await ask(borrower, objectId, origin, {
          start: { kind: "date", date: addDays(today, 3) },
          end: { kind: "duration", days: 2 },
        })
      ).status,
    ).toBe("requested");
  });

  it("is held while the publication waits for approval, and while winding down", async () => {
    const { admin, environmentId, borrower, objectId, publicationId } =
      await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await run(setObjectApproval, admin, { environmentId, required: true });
    expect((await read(borrower, requestId)).status).toBe("on_hold");
    await expect(
      ask(borrower, objectId, environmentOrigin(environmentId)),
    ).rejects.toMatchObject(notFound);

    await run(approvePublication, admin, { environmentId, publicationId });
    expect((await read(borrower, requestId)).status).toBe("requested");

    await run(startEnvironmentWindDown, admin, { environmentId });
    expect((await read(borrower, requestId)).status).toBe("on_hold");
    expect((await stored(requestId)).status).toBe("requested");
  });
});

describe("a direct request between friends (PS-LOAN-001/003)", () => {
  it("is the same request with a direct origin and both parties' declaration", async () => {
    const owner = await user();
    const borrower = await user();
    await friends(borrower, owner);
    const objectId = await create(owner);

    const preview = await executeQuery(tick(), previewLoanRequest, {
      actor: borrower,
      input: { objectId },
    });
    expect(preview.responsibilityDeclarationVersion).toBe(
      responsibilityDeclarationVersion,
    );

    await expect(
      ask(
        borrower,
        objectId,
        { kind: "direct" },
        {
          responsibilityDeclarationVersion: undefined,
        },
      ),
    ).rejects.toMatchObject(invalid);
    await expect(
      ask(
        borrower,
        objectId,
        { kind: "direct" },
        {
          responsibilityDeclarationVersion:
            responsibilityDeclarationVersion + 1,
        },
      ),
    ).rejects.toMatchObject(conflict);

    const { requestId } = await ask(borrower, objectId, { kind: "direct" });
    expect(await read(borrower, requestId)).toMatchObject({
      origin: { kind: "direct" },
      responsibility: {
        version: responsibilityDeclarationVersion,
        acceptedByBorrower: true,
        acceptedByLender: false,
        acceptedByYou: true,
      },
    });
    expect((await read(owner, requestId)).responsibility).toMatchObject({
      acceptedByLender: false,
      acceptedByYou: false,
    });

    const accept = (
      actor: UserActor,
      version = responsibilityDeclarationVersion,
    ) =>
      run(acceptResponsibility, actor, {
        requestId,
        declarationVersion: version,
      });
    await expect(accept(owner, version2())).rejects.toMatchObject(conflict);
    await accept(owner);
    await accept(owner);
    await accept(borrower);
    expect((await read(owner, requestId)).responsibility).toMatchObject({
      acceptedByBorrower: true,
      acceptedByLender: true,
      acceptedByYou: true,
    });
    expect(
      (await eventsFor(requestId)).map((event) => [
        event.event_type,
        (event.payload as { role?: string }).role,
      ]),
    ).toEqual([
      ["loan_request.created", undefined],
      ["loan_request.responsibility_accepted", "borrower"],
      ["loan_request.responsibility_accepted", "lender"],
    ]);

    const stranger = await user();
    await expect(accept(stranger)).rejects.toMatchObject(notFound);
  });

  it("needs a friendship with an owner", async () => {
    const owner = await user();
    const coOwner = await user();
    const borrower = await user();
    const objectId = await create(owner);

    await expect(
      ask(borrower, objectId, { kind: "direct" }),
    ).rejects.toMatchObject(notFound);
    await run(sendFriendRequest, borrower, { userId: owner.userId });
    await expect(
      ask(borrower, objectId, { kind: "direct" }),
    ).rejects.toMatchObject(notFound);

    // A friend of one co-owner may ask; only that co-owner sees it.
    await addCoOwner(owner, objectId, coOwner);
    await friends(borrower, coOwner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });
    expect((await read(coOwner, requestId)).role).toBe("lender");
    await expect(read(owner, requestId)).rejects.toMatchObject(notFound);
    await expect(
      run(declineLoanRequest, owner, { requestId }),
    ).rejects.toMatchObject(notFound);
    expect(await listed(owner, "lender")).toEqual([]);
    await expect(
      run(acceptResponsibility, owner, {
        requestId,
        declarationVersion: responsibilityDeclarationVersion,
      }),
    ).rejects.toMatchObject(notFound);
  });

  it("has no declaration when it came through an environment", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await expect(
      ask(borrower, objectId, environmentOrigin(environmentId), {
        responsibilityDeclarationVersion,
      }),
    ).rejects.toMatchObject(invalid);
    await expect(
      run(acceptResponsibility, owner, {
        requestId,
        declarationVersion: responsibilityDeclarationVersion,
      }),
    ).rejects.toMatchObject(conflict);
  });
});

/** Any version other than the current one. */
const version2 = () => responsibilityDeclarationVersion + 1;

describe("withdrawing and declining", () => {
  it("lets each side end the request once, and only their own way", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const first = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    const second = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    const stranger = await user();

    const reference = { requestId: first.requestId };
    await expect(
      run(withdrawLoanRequest, owner, reference),
    ).rejects.toMatchObject(forbidden);
    await expect(
      run(declineLoanRequest, borrower, reference),
    ).rejects.toMatchObject(forbidden);
    await expect(
      run(withdrawLoanRequest, stranger, reference),
    ).rejects.toMatchObject(notFound);

    expect(
      await run(withdrawLoanRequest, borrower, { requestId: first.requestId }),
    ).toEqual({ requestId: first.requestId, status: "ended" });
    expect(
      await run(declineLoanRequest, owner, { requestId: first.requestId }),
    ).toEqual({ requestId: first.requestId, status: "ended" });
    expect(await stored(first.requestId)).toMatchObject(ended("withdrawn"));

    await run(declineLoanRequest, owner, { requestId: second.requestId });
    expect(await read(borrower, second.requestId)).toMatchObject({
      status: "ended",
      endReason: "declined",
    });
    expect(
      (await eventsFor(second.requestId)).map((event) => event.event_type),
    ).toEqual(["loan_request.created", "loan_request.declined"]);
  });

  it("refuses to change an ended request in the database", async () => {
    const { environmentId, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    await run(withdrawLoanRequest, borrower, { requestId });

    await expect(
      db
        .updateTable("app.loan_requests")
        .set({ status: "requested", ended_at: null, end_reason: null })
        .where("id", "=", requestId)
        .execute(),
    ).rejects.toThrow();
  });
});

describe("changed terms (PS-LOAN-005)", () => {
  it("waits for the borrower to confirm terms that changed", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const seen = await versionOf(objectId);
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    // Other changes leave the confirmed terms in place.
    await run(updateObject, owner, {
      objectId,
      expectedVersion: seen,
      title: "Stor tilhenger",
    });
    expect((await stored(requestId)).status).toBe("requested");

    await run(updateObject, owner, {
      objectId,
      expectedVersion: seen + 1,
      loanTerms: "Må vaskes og tørkes etter bruk.",
    });
    const current = await versionOf(objectId);
    expect(await read(borrower, requestId)).toMatchObject({
      status: "awaiting_terms_confirmation",
      object: { title: "Tilhenger" },
      confirmedTerms: { version: seen, loanTerms: "Må vaskes etter bruk." },
      pendingTerms: {
        version: current,
        loanTerms: "Må vaskes og tørkes etter bruk.",
      },
    });

    // A new request must be made on the terms as they are now.
    await expect(
      ask(borrower, objectId, environmentOrigin(environmentId), {
        termsVersion: seen,
      }),
    ).rejects.toMatchObject({ ...conflict, fields: ["termsVersion"] });
    await expect(
      run(confirmLoanTerms, owner, { requestId, termsVersion: current }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      run(confirmLoanTerms, borrower, { requestId, termsVersion: seen }),
    ).rejects.toMatchObject(conflict);

    expect(
      await run(confirmLoanTerms, borrower, {
        requestId,
        termsVersion: current,
      }),
    ).toEqual({ requestId, status: "requested" });
    expect(await stored(requestId)).toMatchObject({
      status: "requested",
      terms_version: current,
    });
    expect((await read(borrower, requestId)).pendingTerms).toBeNull();
    expect(
      (await eventsFor(requestId)).map((event) => event.event_type),
    ).toEqual(["loan_request.created", "loan_request.terms_confirmed"]);
  });

  it("needs no confirmation when the terms change back", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const seen = await versionOf(objectId);
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await run(updateObject, owner, {
      objectId,
      expectedVersion: seen,
      loanTerms: "Nye vilkår.",
    });
    expect((await stored(requestId)).status).toBe(
      "awaiting_terms_confirmation",
    );
    await run(updateObject, owner, {
      objectId,
      expectedVersion: seen + 1,
      loanTerms: "Må vaskes etter bruk.",
    });
    expect((await stored(requestId)).status).toBe("requested");
  });
});

describe("losing access before approval (PS-LOAN-002)", () => {
  it("ends neutrally when the borrower leaves the environment", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await run(leaveEnvironment, borrower, { environmentId });
    expect(await stored(requestId)).toMatchObject(ended("access_lost"));
    expect(await read(owner, requestId)).toMatchObject({
      status: "ended",
      endReason: "access_lost",
    });
    expect(await eventsFor(requestId)).toHaveLength(1);
  });

  it("ends neutrally when the publication ends", async () => {
    const { environmentId, owner, borrower, objectId, publicationId } =
      await published();
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    await run(withdrawPublication, owner, { objectId, publicationId });
    expect(await stored(requestId)).toMatchObject(ended("publication_ended"));

    // Publishing anew does not bring the old request back.
    await run(publishObject, owner, { objectId, environmentId });
    expect((await read(borrower, requestId)).status).toBe("ended");
  });

  it("ends neutrally when the friendship ends, unless another owner is a friend", async () => {
    const owner = await user();
    const coOwner = await user();
    const borrower = await user();
    const objectId = await create(owner);
    await addCoOwner(owner, objectId, coOwner);
    await friends(borrower, owner);
    await friends(borrower, coOwner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });

    await run(removeFriend, owner, { userId: borrower.userId });
    expect((await stored(requestId)).status).toBe("requested");
    await run(removeFriend, borrower, { userId: coOwner.userId });
    expect(await stored(requestId)).toMatchObject(ended("access_lost"));
  });

  it("ends neutrally on a block either way, without saying who blocked", async () => {
    for (const blocker of ["owner", "borrower"] as const) {
      const { environmentId, owner, borrower, objectId } = await published();
      const { requestId } = await ask(
        borrower,
        objectId,
        environmentOrigin(environmentId),
      );
      const [from, to] =
        blocker === "owner" ? [owner, borrower] : [borrower, owner];

      await run(blockUser, from, { userId: to.userId });
      expect(await stored(requestId)).toMatchObject(ended("access_lost"));
      expect(await read(borrower, requestId)).toMatchObject({
        status: "ended",
        endReason: "access_lost",
      });
      await expect(read(owner, requestId)).rejects.toMatchObject(notFound);
    }
  });

  it("ends when the object stops taking new loans", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const { requestId: archived } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    await run(archiveObject, owner, { objectId });
    expect(await stored(archived)).toMatchObject(ended("object_unavailable"));

    // Co-owners who block each other freeze the object (WP-26).
    const second = await published();
    const coOwner = await user();
    await addCoOwner(second.owner, second.objectId, coOwner);
    const { requestId: frozen } = await ask(
      second.borrower,
      second.objectId,
      environmentOrigin(second.environmentId),
    );
    await run(blockUser, coOwner, { userId: second.owner.userId });
    expect(await stored(frozen)).toMatchObject(ended("object_unavailable"));

    // The borrower becomes an owner themselves.
    const third = await published();
    const { requestId: owned } = await ask(
      third.borrower,
      third.objectId,
      environmentOrigin(third.environmentId),
    );
    await addCoOwner(third.owner, third.objectId, third.borrower);
    expect(await stored(owned)).toMatchObject(ended("object_unavailable"));
    expect(await listed(third.borrower, "lender")).toEqual([]);
    expect((await read(third.borrower, owned)).role).toBe("borrower");
  });

  it("ends a direct request when the befriended owner leaves the object", async () => {
    const owner = await user();
    const coOwner = await user();
    const borrower = await user();
    const objectId = await create(owner);
    await addCoOwner(owner, objectId, coOwner);
    await friends(borrower, coOwner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });

    await run(leaveObject, coOwner, { objectId });
    expect(await stored(requestId)).toMatchObject(ended("access_lost"));
  });

  it("never leaves an open request behind when access ends at the same time", async () => {
    for (let round = 0; round < 3; round += 1) {
      const { environmentId, borrower, objectId } = await published();
      await Promise.allSettled([
        ask(borrower, objectId, environmentOrigin(environmentId)),
        run(leaveEnvironment, borrower, { environmentId }),
      ]);

      const owner = await user();
      const friend = await user();
      await friends(friend, owner);
      const direct = await create(owner);
      await Promise.allSettled([
        ask(friend, direct, { kind: "direct" }),
        run(removeFriend, owner, { userId: friend.userId }),
      ]);
      const blocked = await create(owner);
      await friends(friend, owner);
      await Promise.allSettled([
        ask(friend, blocked, { kind: "direct" }),
        run(blockUser, owner, { userId: friend.userId }),
      ]);

      const open = await db
        .selectFrom("app.loan_requests")
        .select("id")
        .where("object_id", "in", [objectId, direct, blocked])
        .where("status", "<>", "ended")
        .execute();
      expect(open).toEqual([]);
    }
  });
});

describe("historical privacy (PS-ENV-009)", () => {
  it("keeps a request made while closed from an owner who joined after it opened", async () => {
    const admin = await user();
    const environmentId = await environment(admin, { type: "closed" });
    const owner = await member(environmentId, admin);
    const borrower = await member(environmentId, admin);
    const objectId = await create(owner);
    await run(publishObject, owner, { objectId, environmentId });
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);

    const { proposal } = await run(changeEnvironmentType, admin, {
      environmentId,
      expectedType: "closed",
      type: "open",
    });
    for (const supporter of [admin, owner, borrower]) {
      await run(respondToTypeChange, supporter, {
        environmentId,
        proposalId: proposal!.id,
        support: true,
      });
    }
    passDays(typeChangeDays.consent);
    await run(concludeTypeChanges, systemActor(typeChangeProcess), {});
    await join(environmentId, admin, coOwner);

    expect(await listed(owner, "lender")).toEqual([requestId]);
    expect(await listed(coOwner, "lender")).toEqual([]);
    await expect(read(coOwner, requestId)).rejects.toMatchObject(notFound);
    await expect(
      run(declineLoanRequest, coOwner, { requestId }),
    ).rejects.toMatchObject(notFound);
  });

  it("names a hidden environment to the borrower only while a member", async () => {
    const { environmentId, owner, borrower, objectId } = await published({
      type: "hidden",
    });
    const { requestId: withdrawn } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );
    await run(withdrawLoanRequest, borrower, { requestId: withdrawn });
    expect((await read(borrower, withdrawn)).origin).toMatchObject({
      environment: { id: environmentId },
    });

    await run(leaveEnvironment, borrower, { environmentId });
    expect((await read(borrower, withdrawn)).origin).toEqual({
      kind: "environment",
      environment: null,
    });
    // The owner is still a member there, and still sees where it came from.
    expect((await read(owner, withdrawn)).origin).toMatchObject({
      environment: { id: environmentId },
    });
  });

  it("is not shown to owners who are not members of the environment", async () => {
    const { environmentId, owner, borrower, objectId } = await published();
    const coOwner = await user();
    await addCoOwner(owner, objectId, coOwner);
    await friends(borrower, coOwner);
    const { requestId } = await ask(
      borrower,
      objectId,
      environmentOrigin(environmentId),
    );

    expect(await listed(coOwner, "lender")).toEqual([]);
    await expect(read(coOwner, requestId)).rejects.toMatchObject(notFound);
  });
});

describe("deleting the object", () => {
  it("is not held back by requests, and takes them along", async () => {
    const owner = await user();
    const borrower = await user();
    await friends(borrower, owner);
    const objectId = await create(owner);
    const { requestId } = await ask(borrower, objectId, { kind: "direct" });

    expect(await run(consentToObjectDeletion, owner, { objectId })).toEqual({
      objectId,
      deleted: true,
    });
    await expect(read(borrower, requestId)).rejects.toMatchObject(notFound);
  });
});
