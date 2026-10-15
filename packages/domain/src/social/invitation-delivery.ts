import { EmailSendError } from "@lanbort/email";
import { systemActor } from "../actor";
import type { IdentityProviderAdmin } from "../account/deletion";
import { type DomainContext, executeCommand } from "../commands/command";
import { escapeHtml } from "../notifications/email";
import type { NotificationEmailServices } from "../notifications/delivery";
import { defineConsumer, OutboxDeliveryError } from "../outbox/consumer";
import {
  friendInvitationExpired,
  friendInvitationSent,
  friendInvitationWithdrawn,
} from "./events";
import { accountWithAddress, recordInvitationIdentity } from "./invitations";
import { friendInvitationDeliveryProcess } from "./policies";

export interface FriendInvitationDeliveryOptions {
  readonly domain: () => DomainContext;
  /** Undefined where no provider key is configured; delivery is retried. */
  readonly identities: () => IdentityProviderAdmin | undefined;
  /** Undefined where e-mail is not configured; delivery is retried. */
  readonly emails: () => NotificationEmailServices | undefined;
}

export interface FriendInvitationEmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const dateFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Oslo",
});

/** Where an invited participant signs in for the first time. */
export function friendInvitationLink(appUrl: string): string {
  return new URL("/logg-inn", appUrl).toString();
}

/**
 * The invitation to a new participant (PS-USR-015): who invites them, what
 * Lånbort is, whether the sender also asks to be friends, and how to start.
 * The sender's name is the only personal detail; the address it goes to is
 * the one the sender typed.
 */
export function composeFriendInvitationEmail(input: {
  readonly inviterName: string;
  readonly befriend: boolean;
  readonly expiresAt: Date;
  readonly appUrl: string;
}): FriendInvitationEmailContent {
  const name = input.inviterName;
  const link = friendInvitationLink(input.appUrl);
  const subject = `${name} inviterer deg til Lånbort`;
  const paragraphs = [
    `${name} har invitert deg til Lånbort, der folk som kjenner hverandre låner ut ting til hverandre.`,
    ...(input.befriend
      ? [
          `${name} vil også bli venner med deg i Lånbort. Du kan godta eller avslå når du har registrert deg.`,
        ]
      : []),
    "Lånbort bruker ikke passord. Du logger inn med denne e-postadressen og får en engangskode på e-post.",
  ];
  const open = "Registrer deg i Lånbort";
  const footer = `Invitasjonen gjelder til ${dateFormat.format(input.expiresAt)}. Kjenner du ikke ${name}, kan du se bort fra denne e-posten.`;

  return {
    subject,
    text: `${paragraphs.join("\n\n")}\n\n${open}:\n${link}\n\n${footer}\n`,
    html: [
      '<!doctype html><html lang="nb"><body>',
      ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
      `<p><a href="${escapeHtml(link)}">${escapeHtml(open)}</a></p>`,
      `<p style="color:#555;font-size:13px">${escapeHtml(footer)}</p>`,
      "</body></html>",
    ].join(""),
  };
}

const runAs = systemActor(friendInvitationDeliveryProcess);

/**
 * PS-USR-015 after commit (outbox, at-least-once): an invitation from
 * someone who may invite new participants, to an address without an
 * account, lets the address sign in and tells its owner who invited them.
 * Everything else is left to the app: an existing account already has its
 * request (PS-USR-013), and anyone else's invitation sends nothing.
 */
export function friendInvitationDelivery({
  domain,
  identities,
  emails,
}: FriendInvitationDeliveryOptions) {
  return defineConsumer({
    name: "friend_invitation.deliver",
    eventTypes: [friendInvitationSent.type],
    handle: async ({ event, messageId }) => {
      const context = domain();
      const now = context.clock?.() ?? new Date();
      const invitation = await context.db
        .selectFrom("app.friend_invitations as invitation")
        .innerJoin(
          "app.profiles as inviter",
          "inviter.user_id",
          "invitation.inviter_id",
        )
        .select([
          "invitation.inviter_id as inviterId",
          "invitation.address",
          "invitation.befriend",
          "invitation.expires_at as expiresAt",
          "invitation.ended_at as endedAt",
          "inviter.real_name as inviterName",
        ])
        .where("invitation.id", "=", event.resourceId)
        .executeTakeFirst();

      if (
        !invitation ||
        invitation.endedAt !== null ||
        invitation.expiresAt <= now ||
        !context.accountInviters?.has(invitation.inviterId) ||
        (await accountWithAddress(context.db, invitation.address)) !== null
      ) {
        return;
      }

      const provider = identities();
      const services = emails();

      if (!provider) {
        throw new OutboxDeliveryError("identity_provider_unavailable");
      }

      if (!services) {
        throw new OutboxDeliveryError("email_unavailable");
      }

      const subject = await provider.inviteIdentity(invitation.address);

      if (subject !== null) {
        await executeCommand(context, recordInvitationIdentity, {
          actor: runAs,
          input: { invitationId: event.resourceId, subject },
        });
      }

      try {
        await services.sender.send({
          to: invitation.address,
          ...composeFriendInvitationEmail({
            inviterName: invitation.inviterName,
            befriend: invitation.befriend,
            expiresAt: invitation.expiresAt,
            appUrl: services.appUrl,
          }),
          idempotencyKey: messageId,
        });
      } catch (error) {
        if (error instanceof EmailSendError) {
          throw new OutboxDeliveryError(
            `email_${error.code}`
              .toLowerCase()
              .replace(/[^a-z0-9_.:-]/g, "_")
              .slice(0, 64),
            !error.retryable,
          );
        }

        throw error;
      }
    },
  });
}

/**
 * PS-USR-015: a sign-in identity an invitation made for a new participant
 * goes again if the invitation ends before anyone signed in with it, so a
 * withdrawn or expired invitation lets nobody in. One that was used, or
 * that another open invitation to the address still needs, stays.
 */
export function friendInvitationIdentityRemoval({
  domain,
  identities,
}: Omit<FriendInvitationDeliveryOptions, "emails">) {
  return defineConsumer({
    name: "friend_invitation.remove_identity",
    eventTypes: [friendInvitationWithdrawn.type, friendInvitationExpired.type],
    handle: async ({ event }) => {
      const context = domain();
      const invitation = await context.db
        .selectFrom("app.friend_invitations")
        .select(["id", "address", "identity_subject as subject"])
        .where("id", "=", event.resourceId)
        .executeTakeFirst();
      const subject = invitation?.subject;

      if (!invitation || !subject) {
        return;
      }

      const [used, stillInvited] = await Promise.all([
        context.db
          .selectFrom("app.auth_identities")
          .select("user_id")
          .where("provider", "=", "supabase")
          .where("subject", "=", subject)
          .executeTakeFirst(),
        context.db
          .selectFrom("app.friend_invitations")
          .select("id")
          .where("address", "=", invitation.address)
          .where("ended_at", "is", null)
          .where("id", "<>", invitation.id)
          .executeTakeFirst(),
      ]);

      if (stillInvited) {
        // The other invitation keeps it, and removes it if it ends unused.
        await executeCommand(context, recordInvitationIdentity, {
          actor: runAs,
          input: { invitationId: stillInvited.id, subject },
        });
      } else if (!used) {
        const provider = identities();

        if (!provider) {
          throw new OutboxDeliveryError("identity_provider_unavailable");
        }

        await provider.deleteIdentity(subject);
      }

      await executeCommand(context, recordInvitationIdentity, {
        actor: runAs,
        input: { invitationId: invitation.id, subject: null },
      });
    },
  });
}
