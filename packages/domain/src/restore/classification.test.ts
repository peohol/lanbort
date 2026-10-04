import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eventDefinitionsIn, restoreLosses } from "./losses";
import { journalEventTypes } from "./replay";
import { restoreReplays } from "./replays";

/** Every event type the product defines, from each area's `events.ts`. */
async function allEventTypes(): Promise<string[]> {
  const root = new URL("../", import.meta.url);
  const areas = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      readdirSync(new URL(`${entry.name}/`, root)).includes("events.ts"),
    );
  const modules = await Promise.all(
    areas.map(
      (area) =>
        import(new URL(`${area.name}/events.ts`, root).href) as Promise<
          Record<string, unknown>
        >,
    ),
  );

  return modules.flatMap(eventDefinitionsIn).map((event) => event.type);
}

const replayed = restoreReplays.flatMap((replay) =>
  replay.events.map((event) => event.type),
);
const lost = restoreLosses.map((event) => event.type);

describe("restore classification (WP-72, PS-NFR-014)", () => {
  it("classifies every event type as replayed or as a possible loss", async () => {
    const types = await allEventTypes();

    expect(types.length).toBeGreaterThan(100);
    expect([...replayed, ...lost].sort()).toEqual([...new Set(types)].sort());
  });

  it("never both replays and loses the same event type", () => {
    expect(replayed.filter((type) => lost.includes(type))).toEqual([]);
    expect(new Set(replayed).size).toBe(replayed.length);
    expect(new Set(lost).size).toBe(lost.length);
  });

  it("carries what settles an entry in the journal, never other events", () => {
    const settling = restoreReplays.flatMap((replay) =>
      (replay.settledBy ?? []).map((event) => event.type),
    );

    expect([...journalEventTypes].sort()).toEqual(
      [...new Set([...replayed, ...settling])].sort(),
    );
  });
});
