import { describe, expect, it } from "vitest";
import { accountLayerHref } from "./routes";
import {
  arrive,
  arriveInLayer,
  areaStack,
  backOf,
  isStackOf,
  layerBackOf,
  type Place,
  returnToArea,
  ruleStack,
  trail,
} from "./stack";

const loan: Place = { href: "/lan/1", label: "Stige", home: "loans" };
const person: Place = { href: "/personer/2", label: "Kari", home: "home" };
const thing: Place = { href: "/ting/3?miljo=4", label: "Stige", home: "find" };
const queue = { href: "/miljoer/4/administrer", label: "Innmeldinger" };

describe("the navigation stack (UX-IA-009–011)", () => {
  it("adds what the user opens to the stack they are in", () => {
    const stack = arrive(
      arrive(areaStack("find"), thing, "push"),
      person,
      "push",
    );

    // A person opened from a thing in Finn lies in Finn.
    expect(stack.area).toBe("find");
    expect(trail(stack).map(({ label }) => label)).toEqual([
      "Finn",
      "Stige",
      "Kari",
    ]);
    expect(backOf(stack)).toEqual({ href: thing.href, label: "Stige" });
  });

  it("goes back to what is already in the stack instead of a loop", () => {
    const deep = arrive(
      arrive(arrive(areaStack("find"), thing, "push"), person, "push"),
      loan,
      "push",
    );
    const again = arrive(deep, { ...thing, href: "/ting/3" }, "push");

    expect(again.entries.map(({ label }) => label)).toEqual(["Stige"]);
  });

  it("builds a direct entry from the rule, never from history", () => {
    const before = arrive(areaStack("find"), thing, "push");
    const stack = arrive(before, loan, "direct", "varsel");

    expect(stack).toEqual({
      area: "loans",
      entries: [{ href: "/lan/1", label: "Stige" }],
      via: "varsel",
      forward: [],
    });
    // «‹ Lån» always means the overview of Lån.
    expect(backOf(stack)).toEqual({ href: "/lan", label: "Lån" });
  });

  it("puts a queue's fixed container between the area and the target", () => {
    const stack = ruleStack(
      {
        href: "/miljoer/4/innmelding/5",
        label: "Ola",
        home: "home",
        container: queue,
      },
      "epost",
    );

    expect(trail(stack).map(({ label }) => label)).toEqual([
      "Hjem",
      "Innmeldinger",
      "Ola",
    ]);
    expect(backOf(stack)).toEqual(queue);
  });

  it("keeps the mark of a direct entry only until the user moves on", () => {
    const opened = arrive(null, loan, "direct", "epost");

    expect(arrive(opened, loan, "history").via).toBe("epost");
    expect(arrive(opened, person, "push").via).toBeNull();
  });

  it("builds from the rule when history leads outside the stack", () => {
    const stack = arrive(
      arrive(areaStack("loans"), loan, "push"),
      thing,
      "history",
    );

    expect(stack).toEqual(ruleStack(thing, null));
  });

  it("moves back and forward in the stack with the browser", () => {
    const deep = arrive(
      arrive(arrive(areaStack("find"), thing, "push"), person, "push"),
      loan,
      "push",
    );
    const labels = (stack: ReturnType<typeof arrive>) =>
      trail(stack).map(({ label }) => label);

    const back = arrive(deep, person, "history");
    expect(labels(back)).toEqual(["Finn", "Stige", "Kari"]);
    expect(arrive(back, loan, "history")).toEqual(deep);

    // Back to the area's own page, then forward two steps at once.
    const area = returnToArea(back, "find", "history");
    expect(area.entries).toEqual([]);
    expect(labels(arrive(area, person, "history"))).toEqual(labels(back));

    // Following a link ends the way forward.
    const elsewhere = arrive(back, { ...loan, href: "/lan/9" }, "push");
    expect(arrive(elsewhere, loan, "history")).toEqual(ruleStack(loan, null));
    expect(returnToArea(back, "find", "push")).toEqual(areaStack("find"));
  });

  it("knows whether a stack belongs to the page", () => {
    const stack = arrive(areaStack("loans"), loan, "push");

    expect(isStackOf(stack, "/lan/1?historikk=1")).toBe(true);
    expect(isStackOf(stack, "/lan")).toBe(false);
    expect(isStackOf(areaStack("loans"), "/lan")).toBe(false);
    expect(isStackOf(null, "/lan/1")).toBe(false);
  });
});

describe("a layer's own stack (UX-IA-020)", () => {
  const account = { href: "/konto", label: "Konto" };
  const friends = { href: "/konto/venner", label: "Venner" };
  const ola = { href: "/konto/personer/2", label: "Ola" };
  const under = { href: "/lan?rolle=laaner", index: 3 };

  it("keeps the screen it was opened over, and goes back within itself", () => {
    const opened = arriveInLayer(null, "account", account, "push", under);
    const stack = arriveInLayer(
      arriveInLayer(opened, "account", friends, "push", null),
      "account",
      ola,
      "push",
      null,
    );

    expect(stack.under).toEqual(under);
    expect(stack.entries.map(({ label }) => label)).toEqual([
      "Konto",
      "Venner",
      "Ola",
    ]);
    expect(layerBackOf(stack, ola.href)).toEqual(friends);
    expect(layerBackOf(opened, account.href)).toBeNull();

    // Back to Venner, by the browser or the way back.
    const back = arriveInLayer(stack, "account", friends, "history", null);
    expect(back.entries).toEqual([account, friends]);
    expect(back.under).toEqual(under);

    // And forward again with the browser.
    expect(arriveInLayer(back, "account", ola, "history", null)).toEqual(stack);
  });

  it("has nothing under it when reached from outside, and lies under its first page", () => {
    const direct = arriveInLayer(null, "account", friends, "direct", under);
    expect(direct.under).toBeNull();
    expect(direct.entries).toEqual([account, friends]);
    expect(layerBackOf(direct, friends.href)).toEqual(account);
    // Back or forward into it still knows the screen it lies over.
    expect(
      arriveInLayer(null, "account", friends, "history", under).under,
    ).toEqual(under);
  });

  it("opens people and own cases inside the account", () => {
    expect(accountLayerHref("/personer/2?rolle=laantaker")).toBe(
      "/konto/personer/2?rolle=laantaker",
    );
    expect(accountLayerHref("/saker")).toBe("/konto/saker");
    expect(accountLayerHref("/saker/5")).toBe("/konto/saker/5");
    expect(accountLayerHref("/saker/ny")).toBeNull();
    expect(accountLayerHref("/saker/miljo/4")).toBeNull();
    expect(accountLayerHref("/lan/1")).toBeNull();
  });
});
