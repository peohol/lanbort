import { describe, expect, it } from "vitest";
import {
  type CaseStart,
  environmentCasesHref,
  newCaseHref,
  parseCaseStart,
} from "./cases";

const environmentId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const objectId = "00000000-0000-4000-8000-000000000003";

const fromHref = (href: string) =>
  parseCaseStart(
    Object.fromEntries(new URL(href, "https://lanbort.test").searchParams),
  );

describe("the address of a new case", () => {
  it.each<CaseStart>([
    { kind: "contact", environmentId },
    {
      kind: "report",
      environmentId,
      subject: { kind: "user", id: userId },
    },
    {
      kind: "report",
      environmentId: null,
      subject: { kind: "object", id: objectId },
    },
    {
      kind: "report",
      environmentId: null,
      subject: { kind: "review_response", id: objectId },
    },
  ])("names the same start it was made from: %o", (start) => {
    expect(fromHref(newCaseHref(start))).toEqual(start);
  });

  it("names nothing without exactly one valid subject", () => {
    expect(parseCaseStart({})).toBeNull();
    expect(parseCaseStart({ person: "abc" })).toBeNull();
    expect(parseCaseStart({ person: userId, ting: objectId })).toBeNull();
    expect(parseCaseStart({ person: [userId] })).toBeNull();
  });

  it("reports a review only to the platform", () => {
    expect(
      parseCaseStart({ miljo: environmentId, anmeldelse: objectId }),
    ).toEqual({
      kind: "report",
      environmentId: null,
      subject: { kind: "review", id: objectId },
    });
  });
});

describe("an environment's queue", () => {
  it("shows open cases unless asked for the closed ones", () => {
    expect(environmentCasesHref(environmentId)).toBe(
      `/saker/miljo/${environmentId}`,
    );
    expect(environmentCasesHref(environmentId, "closed")).toBe(
      `/saker/miljo/${environmentId}?vis=lukkede`,
    );
  });
});
