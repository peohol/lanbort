import { describe, expect, it } from "vitest";
import { ConsumerRegistry, defineConsumer } from "./consumer";

const consumer = (eventTypes: string[]) => ({
  name: "test.consumer",
  eventTypes,
  handle: async () => {},
});

describe("defineConsumer", () => {
  it("registers a consumer once per event type", () => {
    const registry = new ConsumerRegistry([
      defineConsumer(consumer(["a.created", "a.removed"])),
    ]);

    expect(registry.consumersFor("a.created")).toHaveLength(1);
  });

  it("registers an undefined consumer once even if it repeats a type", () => {
    const registry = new ConsumerRegistry([
      consumer(["a.created", "a.created"]),
    ]);

    expect(registry.consumersFor("a.created")).toHaveLength(1);
  });

  it("rejects consumers without events or with a repeated event type", () => {
    expect(() => defineConsumer(consumer([]))).toThrow();
    expect(() => defineConsumer(consumer(["a.created", "a.created"]))).toThrow(
      /repeats an event type/,
    );
  });
});
