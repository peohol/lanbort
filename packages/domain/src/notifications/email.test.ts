import { notificationKinds, type NotificationKind } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import {
  composeNotificationEmail,
  notificationEmailLink,
  notificationEmailSubjects,
} from "./email";
import { effectivePreferences, sendsEmail } from "./model";

const notificationId = "2b0b4e43-6c5f-4d8a-9a43-0b1f3e1d2c11";

describe("notification e-mails (WP-41)", () => {
  it("have a subject for every kind", () => {
    expect(Object.keys(notificationEmailSubjects).sort()).toEqual(
      Object.keys(notificationKinds).sort(),
    );
  });

  it("say only the kind, lead back to the notification and say why they came", () => {
    const email = composeNotificationEmail({
      kind: "loan.cancelled",
      level: "required",
      notificationId,
      appUrl: "https://lanbort.example/",
    });
    const link = `https://lanbort.example/?varsel=${notificationId}`;

    expect(email.subject).toBe("Et lån er kansellert");
    expect(email.text).toBe(
      `Et lån er kansellert.\n\nÅpne Lånbort for å se hva det gjelder:\n${link}\n\n` +
        "Du får denne e-posten fordi viktige varsler om lån du er part i alltid sendes på e-post.\n",
    );
    expect(email.html).toContain(`<a href="${link}">`);
    expect(email.html).toContain('lang="nb"');

    expect(
      composeNotificationEmail({
        kind: "social.friend_request",
        level: "action",
        notificationId,
        appUrl: "https://lanbort.example",
      }).text,
    ).toContain("slå det av i varslingsvalgene");
  });

  it("escape what goes into the markup", () => {
    const { html } = composeNotificationEmail({
      kind: "loan.cancelled",
      level: "required",
      notificationId,
      appUrl: "https://lanbort.example/\"'<x>",
    });

    expect(html).not.toMatch(/<x>|"'/);
  });

  it("link to the notification on the app's own origin only", () => {
    expect(
      notificationEmailLink("https://lanbort.example/sti?x=1", notificationId),
    ).toBe(`https://lanbort.example/?varsel=${notificationId}`);
  });
});

describe("which levels go out by e-mail (pilot standard)", () => {
  it("send required notifications always, the others only when chosen and in the app", () => {
    const standard = effectivePreferences([]);
    const level = (kind: NotificationKind) => notificationKinds[kind];

    expect(sendsEmail(level("loan.cancelled"), standard)).toBe(true);
    expect(sendsEmail(level("social.friend_request"), standard)).toBe(false);
    expect(sendsEmail("information", standard)).toBe(false);

    const chosen = effectivePreferences([
      // Not configurable: ignored even if it were ever stored.
      { level: "required", channel: "email", enabled: false },
      { level: "action", channel: "email", enabled: true },
      { level: "information", channel: "email", enabled: true },
      { level: "information", channel: "in_app", enabled: false },
    ]);
    expect(sendsEmail("required", chosen)).toBe(true);
    expect(sendsEmail("action", chosen)).toBe(true);
    expect(sendsEmail("information", chosen)).toBe(false);
  });
});
