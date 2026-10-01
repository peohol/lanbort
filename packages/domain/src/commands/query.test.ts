import { describe, expect, it } from "vitest";
import { z } from "zod";
import { anonymousActor, type UserActor } from "../actor";
import { allow, definePolicy, deny } from "../authorization/policy";
import { requireUser } from "../authorization/rules";
import { defineQuery, executeQuery } from "./query";

const alice: UserActor = { kind: "user", userId: "alice" };
const bob: UserActor = { kind: "user", userId: "bob" };
const notes = new Map([["n1", { ownerId: "alice", text: "private" }]]);
let loads = 0;

const readNote = defineQuery({
  name: "test.note.read",
  input: z.strictObject({ noteId: z.string() }),
  policy: definePolicy<{ ownerId: string; text: string }, void>({
    action: "test.note.read",
    actor: [requireUser],
    resource: [
      ({ actor, resource }) =>
        actor.kind === "user" && actor.userId === resource.ownerId
          ? allow
          : deny("not_found"),
    ],
  }),
  load: async ({ input }) => {
    loads += 1;
    const note = notes.get(input.noteId);
    return note ? { resource: note, context: undefined } : null;
  },
  present: ({ resource }) => ({ text: resource.text }),
});

const domain = { db: {} as never };

describe("protected queries", () => {
  it("returns the presented result when the policy allows", async () => {
    await expect(
      executeQuery(domain, readNote, { actor: alice, input: { noteId: "n1" } }),
    ).resolves.toEqual({ text: "private" });
  });

  it("does not load anything for an unauthenticated caller", async () => {
    loads = 0;
    await expect(
      executeQuery(domain, readNote, {
        actor: anonymousActor,
        input: { noteId: "n1" },
      }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(loads).toBe(0);
  });

  it("gives another user the same answer as for a note that does not exist", async () => {
    const denied = await executeQuery(domain, readNote, {
      actor: bob,
      input: { noteId: "n1" },
    }).catch((error: unknown) => error);
    const missing = await executeQuery(domain, readNote, {
      actor: bob,
      input: { noteId: "n2" },
    }).catch((error: unknown) => error);

    expect(denied).toMatchObject({
      code: "not_found",
      action: "test.note.read",
    });
    expect(missing).toMatchObject({
      code: "not_found",
      action: "test.note.read",
    });
  });
});
