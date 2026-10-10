import {
  type Notification,
  type NotificationTargetType,
  notificationKindSchema,
} from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  arrangeNotifications,
  notificationHref,
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

  it("names who wrote and how many new messages, never what (PS-COM-018)", () => {
    const about = {
      thing: null,
      picture: null,
      person: "Aisha Rahman",
      place: null,
    };

    expect(
      notificationWords({
        kind: "chat.new_messages",
        detail: "messages_1",
        about,
      }).title,
    ).toBe("Ny melding fra Aisha Rahman");
    expect(
      notificationWords({
        kind: "chat.new_messages",
        detail: "messages_3",
        about,
      }).title,
    ).toBe("3 nye meldinger fra Aisha Rahman");
    // Someone the reader may no longer see goes unnamed.
    expect(
      notificationWords({
        kind: "chat.new_messages",
        detail: "messages_2",
        about: { ...about, person: null },
      }).title,
    ).toBe("2 nye meldinger i privat chat");
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
    picture: null,
    person: "Per Lien",
    place: "Borettslaget Lia",
  };
  const nobody = { thing: null, picture: null, person: null, place: null };

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

describe("a request for more information (PS-ENV-019)", () => {
  it("names who asks, never the question, and follows the applicant's answer", () => {
    const kind = "environment.membership_information_requested";
    const about = { thing: null, picture: null, person: null, place: "Gården" };

    expect(notificationWords({ kind, detail: null, about }).title).toBe(
      "Administratorene i Gården ber om mer informasjon",
    );
    expect(
      notificationWords({
        kind,
        detail: null,
        about: { ...about, place: null },
      }).title,
    ).toBe("Administratorene i et miljø ber om mer informasjon");
    expect(
      notificationWords({ kind, detail: null, about, standing: "accepted" })
        .detail,
    ).toBe("Du har sendt svarene på nytt.");
    expect(
      notificationWords({ kind, detail: null, about, standing: "lapsed" })
        .detail,
    ).toBe("Søknaden venter ikke lenger på deg.");
  });
});

describe("an application's outcome (PS-ENV-017)", () => {
  const about: {
    thing: null;
    picture: null;
    person: null;
    place: string | null;
  } = { thing: null, picture: null, person: null, place: "Verkstedet" };
  const said = (
    kind: "environment.membership_approved" | "environment.membership_rejected",
    detail: string | null,
    named = about,
  ) => notificationWords({ kind, detail, about: named }).title;

  it("names the environment and says only what was decided", () => {
    expect(said("environment.membership_approved", null)).toBe(
      "Søknaden din til Verkstedet er godkjent",
    );
    expect(said("environment.membership_rejected", null)).toBe(
      "Søknaden din til Verkstedet ble ikke godkjent",
    );
    expect(said("environment.membership_approved", "reactivation")).toBe(
      "Du er aktivt medlem av Verkstedet igjen",
    );
    expect(said("environment.membership_rejected", "reactivation")).toBe(
      "Søknaden din om å bli aktiv igjen i Verkstedet ble ikke godkjent",
    );
    expect(
      said("environment.membership_rejected", "reactivation", {
        ...about,
        place: null,
      }),
    ).toBe("Søknaden din om å bli aktiv igjen ble ikke godkjent");
  });

  it("opens the environment with its welcome the first time an approval is followed", () => {
    const environmentId = "00000000-0000-4000-8000-0000000000e1";
    const approval: Notification = {
      id: "00000000-0000-4000-8000-0000000000a1",
      kind: "environment.membership_approved",
      level: "action",
      detail: null,
      target: { type: "environment", id: environmentId },
      occurredAt: "2026-10-10T10:00:00.000Z",
      readAt: null,
    };

    expect(notificationHref(approval)).toBe(
      `/miljoer/${environmentId}?velkommen`,
    );
    expect(
      notificationHref({ ...approval, readAt: "2026-10-10T11:00:00.000Z" }),
    ).toBe(`/miljoer/${environmentId}`);
    expect(
      notificationHref({
        ...approval,
        kind: "environment.membership_rejected",
      }),
    ).toBe(`/miljoer/${environmentId}`);
    expect(notificationHref({ ...approval, detail: "reactivation" })).toBe(
      `/miljoer/${environmentId}`,
    );
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

  it("gathers older read notifications per conversation", () => {
    const latest = notification("chat_conversation", "3", true);
    const { earlier } = arrangeNotifications([
      latest,
      notification("chat_conversation", "3", true),
    ]);

    expect(earlier).toEqual([{ notification: latest, older: 1 }]);
    expect(olderText(earlier[0]!)).toBe("Og 1 eldre varsel om denne samtalen");
  });
});
