import { describe, expect, it } from "vitest";
import { type ChatLoan, cameFromFirst } from "./loans";

const loan = (kind: ChatLoan["kind"], id: string): ChatLoan => ({
  kind,
  id,
  href: kind === "loan" ? `/lan/${id}` : `/lan/foresporsel/${id}`,
  title: id,
  status: "Utlånt",
  picture: null,
});

describe("the loans between two people (UX-IA-014)", () => {
  const loans = [loan("loan", "a"), loan("loan", "b"), loan("request", "c")];
  const conversation = { href: "/samtaler/x" };

  it("puts the loan the conversation was opened from first", () => {
    expect(
      cameFromFirst(loans, [{ href: "/lan/b" }, conversation]).map(
        ({ id }) => id,
      ),
    ).toEqual(["b", "a", "c"]);
    expect(
      cameFromFirst(loans, [
        { href: "/lan/foresporsel/c?steg=1" },
        conversation,
        { href: "/samtaler/x/om" },
      ]).map(({ id }) => id),
    ).toEqual(["c", "a", "b"]);
  });

  it("takes the latest loan on the way back", () => {
    expect(
      cameFromFirst(loans, [
        { href: "/lan/a" },
        { href: "/lan/b" },
        conversation,
      ]).map(({ id }) => id),
    ).toEqual(["b", "a", "c"]);
  });

  it("keeps the order when the conversation was not opened from a loan", () => {
    expect(cameFromFirst(loans, [conversation])).toBe(loans);
    expect(cameFromFirst(loans, [{ href: "/lan/z" }])).toBe(loans);
  });
});
