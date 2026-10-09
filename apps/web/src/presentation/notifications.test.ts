import {
  type Notification,
  type NotificationTargetType,
  notificationKindSchema,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  arrangeNotifications,
  notificationWhen,
  notificationWords,
  olderText,
} from "./notifications";

describe("what a notification says", () => {
  it("has a sentence for every kind", () => {
    for (const kind of notificationKindSchema.options) {
      expect(notificationWords({ kind, detail: null }).title).toMatch(/\S/);
    }
  });

  it("explains the security impact of a new chat device", () => {
    const { title, detail } = notificationWords({
      kind: "chat.device_linked",
      detail: null,
    });

    expect(title).toBe("En ny enhet er koblet til privat chat");
    expect(detail).toContain("kan motta nye meldinger");
    expect(detail).toContain("ikke tidligere meldinger automatisk");
    expect(detail).toContain("Mine enheter");
  });

  it("says what the other party said, where the detail tells", () => {
    expect(
      notificationWords({ kind: "loan.return_reported", detail: "still_has" }),
    ).toEqual({
      title: "Låntakeren sier at de fortsatt har objektet",
      detail: null,
    });
    expect(
      notificationWords({ kind: "loan.return_reported", detail: "unknown" })
        .title,
    ).toBe("Den andre parten har svart om en retur");
    expect(
      notificationWords({ kind: "environment.role_invited", detail: "owner" })
        .title,
    ).toBe("Du er spurt om å bli eier av et miljø");
  });
});

describe("what it is about, and what became of it", () => {
  const about = {
    thing: "stigen",
    person: "Per Lien",
    place: "Borettslaget Lia",
  };
  const nobody = { thing: null, person: null, place: null };

  it("names what the reader may see", () => {
    expect(
      notificationWords({ kind: "loan_request.received", detail: null, about })
        .title,
    ).toBe("Per Lien vil låne stigen");
    expect(
      notificationWords({
        kind: "loan.return_reported",
        detail: "returned",
        about,
      }).title,
    ).toBe("Per Lien har meldt stigen returnert");
    expect(
      notificationWords({
        kind: "environment.role_invited",
        detail: "owner",
        about,
      }).title,
    ).toBe("Du er spurt om å bli eier i Borettslaget Lia");
  });

  it("falls back to the general sentence where a name is missing", () => {
    for (const kind of notificationKindSchema.options) {
      expect(
        notificationWords({ kind, detail: null, about: nobody }).title,
      ).toBe(notificationWords({ kind, detail: null }).title);
    }
  });

  it("asks no more once answered, and says when it no longer applies (UX-IA-019)", () => {
    const friend = { kind: "social.friend_request", detail: null } as const;

    expect(
      notificationWords({ ...friend, standing: "open", readAt: null }).detail,
    ).toBeNull();
    expect(
      notificationWords({
        ...friend,
        standing: "open",
        readAt: "2026-10-12T10:00:00.000Z",
      }).detail,
    ).toBe("Lest. Du har ikke svart ennå; oppgaven står på Hjem.");
    expect(notificationWords({ ...friend, standing: "accepted" }).detail).toBe(
      "Dere er venner.",
    );
    expect(notificationWords({ ...friend, standing: "lapsed" })).toEqual({
      title: "Du har fått en venneforespørsel",
      detail: "Forespørselen gjelder ikke lenger.",
    });
    expect(
      notificationWords({
        kind: "environment.membership_invited",
        detail: null,
        standing: "declined",
      }).detail,
    ).toBe("Du takket nei.");
  });
});

describe("when it happened", () => {
  const now = new Date("2026-10-12T15:00:00Z");

  it("is as short as is clear", () => {
    expect(notificationWhen("2026-10-12T14:52:00Z", now)).toBe("16:52");
    expect(notificationWhen("2026-10-11T06:12:00Z", now)).toBe("i går 08:12");
    expect(notificationWhen("2026-10-10T10:00:00Z", now)).toMatch(
      /^lør\.? 10\. okt/,
    );
    expect(notificationWhen("2025-12-30T10:00:00Z", now)).toMatch(/2025$/);
  });
});

let next = 0;

function notification(
  type: NotificationTargetType,
  targetId: string,
  read: boolean,
): Notification {
  next += 1;

  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    kind: "loan.approved",
    level: "required",
    detail: null,
    target: {
      type,
      id: `00000000-0000-4000-9000-${targetId.padStart(12, "0")}`,
    },
    occurredAt: "2026-10-12T10:00:00.000Z",
    readAt: read ? "2026-10-12T11:00:00.000Z" : null,
  };
}

describe("the notification centre's order (UX-IA-018–019)", () => {
  it("keeps every unread one apart and gathers older read ones per loan", () => {
    const newUnread = notification("loan", "1", false);
    const latest = notification("loan", "1", true);
    const friend = notification("user", "2", true);
    const older = [
      notification("loan", "1", true),
      notification("loan", "1", true),
    ];
    const otherFriend = notification("user", "2", true);
    const { unread, earlier } = arrangeNotifications([
      newUnread,
      latest,
      friend,
      ...older,
      otherFriend,
    ]);

    expect(unread).toEqual([newUnread]);
    expect(earlier).toEqual([
      { notification: latest, older: 2 },
      { notification: friend, older: 0 },
      { notification: otherFriend, older: 0 },
    ]);
    expect(olderText(earlier[0]!)).toBe("Og 2 eldre varsler om dette lånet");
    expect(olderText(earlier[1]!)).toBeNull();
  });
});
