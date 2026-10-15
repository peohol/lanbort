import { describe, expect, it } from "vitest";
import { friendScanHref } from "@/navigation/routes";
import {
  friendCodeLink,
  invitationDetail,
  invitationSentText,
  readFriendCodeLink,
  timeLeft,
} from "./friend-invitations";

const origin = "https://xn--lnbort-fua.no";
const invitation = {
  id: "8a0b8d36-5d4c-4a43-9b0f-0f0f0f0f0f0f",
  email: "kari@example.no",
  befriend: true,
  sentAt: "2026-10-15T08:00:00.000Z",
  expiresAt: "2026-10-29T08:00:00.000Z",
};

describe("friend invitations", () => {
  it("confirms a sent invitation the same way whatever the address is", () => {
    // Nothing in the confirmation comes from the server's view of the
    // address: only what the sender wrote and when it ends.
    const asked = invitationSentText(invitation, false);
    expect(asked).toContain("Sendt til kari@example.no.");
    expect(asked).toContain("Har personen en konto med denne adressen");
    expect(asked).toMatch(/Den gjelder til torsdag 29\. oktober kl\. 09:00\.$/);

    const invited = invitationSentText(
      { ...invitation, befriend: false },
      true,
    );
    expect(invited).toContain("Er adressen ikke i Lånbort fra før");
    expect(invited).not.toContain("Venneforespørselen");
    expect(invitationSentText(invitation, true)).toContain(
      "Venneforespørselen venter på dem",
    );
  });

  it("says what each open invitation is and how long it lasts", () => {
    expect(invitationDetail(invitation)).toMatch(
      /^Venneforespørsel · gjelder til /,
    );
    expect(invitationDetail({ ...invitation, befriend: false })).toMatch(
      /^Invitasjon til Lånbort · /,
    );
  });

  it("reads friend codes only from this site's scanning page", () => {
    const link = friendCodeLink(origin, "ABCDE12345");
    expect(link).toBe(`${origin}${friendScanHref}#ABCDE12345`);
    expect(readFriendCodeLink(link, origin)).toBe("ABCDE12345");
    // Typed as people write it: lower case and a dash are fine.
    expect(
      readFriendCodeLink(`${origin}${friendScanHref}#abcde-12345`, origin),
    ).toBe("ABCDE12345");
    expect(
      readFriendCodeLink(link.replace(origin, "https://annen.no"), origin),
    ).toBeUndefined();
    expect(
      readFriendCodeLink(`${origin}/samtaler#ABCDE12345`, origin),
    ).toBeUndefined();
    expect(
      readFriendCodeLink(`${origin}${friendScanHref}#UUUUU`, origin),
    ).toBeUndefined();
    expect(readFriendCodeLink("lanbort-link:ABC", origin)).toBeUndefined();
    expect(readFriendCodeLink("ikke en lenke", origin)).toBeUndefined();
  });

  it("counts down in minutes and seconds, never below zero", () => {
    const expiresAt = "2026-10-15T08:05:00.000Z";
    const at = (iso: string) => Date.parse(iso);
    expect(timeLeft(expiresAt, at("2026-10-15T08:00:00.000Z"))).toBe("5:00");
    expect(timeLeft(expiresAt, at("2026-10-15T08:04:50.500Z"))).toBe("0:10");
    expect(timeLeft(expiresAt, at("2026-10-15T08:06:00.000Z"))).toBe("0:00");
  });
});
