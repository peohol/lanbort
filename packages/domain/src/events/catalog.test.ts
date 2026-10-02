import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEvent } from "./catalog";
import { EventRecorder } from "./recorder";

const noteArchived = defineEvent({
  type: "test.note_archived",
  version: 1,
  kind: "domain",
  resourceType: "test_note",
  payload: z.strictObject({ reason: z.enum(["owner_request", "expired"]) }),
});

describe("event catalog", () => {
  it("requires a strict payload schema so extra data cannot slip in", () => {
    expect(() =>
      defineEvent({
        type: "test.loose",
        version: 1,
        kind: "domain",
        resourceType: "test_note",
        payload: z.object({ id: z.string() }),
      }),
    ).toThrow(/strict payload schema/);
  });

  it("rejects malformed type, version and resource type", () => {
    const base = {
      type: "test.ok",
      version: 1,
      kind: "audit" as const,
      resourceType: "test_note",
      payload: z.strictObject({}),
    };

    expect(() => defineEvent({ ...base, type: "NoDot" })).toThrow();
    expect(() => defineEvent({ ...base, version: 0 })).toThrow();
    expect(() => defineEvent({ ...base, resourceType: "Bad Type" })).toThrow();
  });
});

describe("event recorder", () => {
  it("validates payloads against the event schema when recorded", () => {
    const recorder = new EventRecorder();

    recorder.record(noteArchived, {
      resourceId: "note-1",
      payload: { reason: "expired" },
    });

    expect(() =>
      recorder.record(noteArchived, {
        resourceId: "note-1",
        payload: { reason: "expired", email: "a@example.com" } as never,
      }),
    ).toThrow();
    expect(() =>
      recorder.record(noteArchived, {
        resourceId: "not a valid id",
        payload: { reason: "expired" },
      }),
    ).toThrow(/Invalid resource id/);
    expect(recorder.pending).toHaveLength(1);
  });
});
