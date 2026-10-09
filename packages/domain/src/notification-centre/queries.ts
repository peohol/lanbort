import {
  type DescribedNotification,
  type Notification,
  type NotificationCentrePage,
  notificationListQuerySchema,
  type NotificationStanding,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import type { Actor } from "../actor";
import { defineQuery } from "../commands/query";
import { canSeeEnvironment } from "../environment/policies";
import { loadEnvironmentAccess } from "../environment/store";
import { homeReader, type HomeReader } from "../home/source";
import { readLoan, readLoanRequest } from "../loans/queries";
import { listNotifications } from "../notifications/queries";
import { listNotificationsPolicy } from "../notifications/policies";
import { actingUserId } from "../objects/state";
import { personVisible } from "../people/policies";
import { loadPeople } from "../people/store";
import {
  friendRequestStanding,
  invitationStanding,
  membershipInvitationStanding,
  requestStanding,
} from "./standing";

type Db = Kysely<Database>;

/** What one target tells about the notifications that lead to it. */
interface Described {
  readonly about: DescribedNotification["about"];
  /** For a notification of `kind` with `detail` that asks for an answer. */
  readonly standing?: (
    notification: Notification,
  ) => NotificationStanding | null;
}

const nobody: Described = {
  about: { thing: null, person: null, place: null },
};

interface Reading {
  readonly db: Db;
  readonly actor: Actor;
  readonly userId: string;
  readonly now: Date;
  readonly reader: HomeReader;
}

/**
 * The loan as the reader sees it now: the thing, the other party and the
 * environment it came through, as `loan.read` names them.
 */
async function loanAbout({ reader, userId }: Reading, loanId: string) {
  const loan = await reader.ifAllowed(readLoan, { loanId });

  if (!loan) return nobody;

  const other =
    loan.borrowerUserId === userId
      ? loan.parties.lender
      : loan.parties.borrower;

  return {
    about: {
      thing: loan.agreement.title,
      person: other.realName,
      place:
        loan.origin.kind === "environment"
          ? (loan.origin.environment?.name ?? null)
          : null,
    },
  };
}

async function requestAbout({ reader }: Reading, requestId: string) {
  const request = await reader.ifAllowed(readLoanRequest, { requestId });

  if (!request) return nobody;

  return {
    about: {
      thing: request.object?.title ?? null,
      person: request.role === "lender" ? request.borrower.realName : null,
      place:
        request.origin.kind === "environment"
          ? (request.origin.environment?.name ?? null)
          : null,
    },
    standing: ({ kind }: Notification) => requestStanding(kind, request),
  };
}

/** A person by name only while the reader may see them (UX-PRIV-007, -010). */
async function personAbout({ db, userId, now }: Reading, personId: string) {
  const person = (await loadPeople(db, userId, [personId], now)).get(personId);

  return {
    about: {
      thing: null,
      person: person && personVisible(person) ? person.realName : null,
      place: null,
    },
    standing: ({ kind }: Notification) =>
      kind === "social.friend_request"
        ? friendRequestStanding(person?.pair ?? null)
        : null,
  };
}

/**
 * An environment by name only while the reader can see it (PS-ENV-001),
 * and the reader's own invitations there.
 */
async function environmentAbout(
  { db, actor, userId, now }: Reading,
  environmentId: string,
): Promise<Described> {
  const access = await loadEnvironmentAccess(db, environmentId, actor, now);
  const visible =
    access !== null &&
    canSeeEnvironment({ actor, now, resource: access, context: undefined })
      .allowed;
  const membership = await db
    .selectFrom("app.environment_memberships")
    .select(["state", "origin", "end_reason as endReason"])
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  const roleInvitations = await db
    .selectFrom("app.environment_role_invitations")
    .select(["role", "outcome"])
    .where("environment_id", "=", environmentId)
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .execute();

  return {
    about: {
      thing: null,
      person: null,
      place: visible ? access.environment.name : null,
    },
    standing: ({ kind, detail }) => {
      switch (kind) {
        case "environment.membership_invited":
          return membershipInvitationStanding(membership ?? null);
        case "environment.role_invited": {
          const invitation = roleInvitations.find(
            ({ role }) => role === detail,
          );

          return invitation ? invitationStanding(invitation.outcome) : "lapsed";
        }
        default:
          return null;
      }
    },
  };
}

/** The reader's own invitation to co-own an object. */
async function invitationAbout(
  { db, userId }: Reading,
  invitationId: string,
): Promise<Described> {
  const invitation = await db
    .selectFrom("app.object_co_owner_invitations as invitation")
    .innerJoin("app.objects as object", "object.id", "invitation.object_id")
    .select(["invitation.status", "object.title"])
    .where("invitation.id", "=", invitationId)
    .where("invitation.invited_user_id", "=", userId)
    .executeTakeFirst();

  return {
    about: {
      // The object is shown to the invitee only while they are asked, or
      // once they co-own it.
      thing:
        invitation?.status === "pending" || invitation?.status === "accepted"
          ? invitation.title
          : null,
      person: null,
      place: null,
    },
    standing: () =>
      invitation ? invitationStanding(invitation.status) : "lapsed",
  };
}

/**
 * The other one in the reader's own conversation, by name only while the
 * reader may see them (PS-COM-018: the name and a count, nothing written).
 */
async function conversationAbout(
  reading: Reading,
  conversationId: string,
): Promise<Described> {
  const other = await reading.db
    .selectFrom("app.chat_participants as own")
    .innerJoin(
      "app.chat_participants as other",
      "other.conversation_id",
      "own.conversation_id",
    )
    .select("other.user_id")
    .where("own.conversation_id", "=", conversationId)
    .where("own.user_id", "=", reading.userId)
    .where("other.user_id", "<>", reading.userId)
    .executeTakeFirst();

  return other ? personAbout(reading, other.user_id) : nobody;
}

const describers: Partial<
  Record<
    Notification["target"]["type"],
    (reading: Reading, id: string) => Promise<Described>
  >
> = {
  loan: loanAbout,
  loan_reviews: loanAbout,
  loan_request: requestAbout,
  user: personAbout,
  environment: environmentAbout,
  object_invitation: invitationAbout,
  chat_conversation: conversationAbout,
};

/**
 * Names and standing for a page of the reader's notifications, one read
 * per target they lead to. Each name comes from what the reader may see
 * now, never from the notification, which carries no content (PS-COM-001).
 */
async function describe(
  reading: Reading,
  notifications: readonly Notification[],
): Promise<DescribedNotification[]> {
  const targets = new Map(
    notifications.map(({ target }) => [`${target.type}/${target.id}`, target]),
  );
  const described = new Map(
    await Promise.all(
      [...targets].map(async ([key, target]) => {
        const describer = describers[target.type];

        return [
          key,
          describer ? await describer(reading, target.id) : nobody,
        ] as const;
      }),
    ),
  );

  return notifications.map((notification) => {
    const { about, standing } = described.get(
      `${notification.target.type}/${notification.target.id}`,
    )!;

    return {
      ...notification,
      about,
      standing: standing?.(notification) ?? null,
    };
  });
}

/**
 * The notification centre as the reader reads it («Hjem og varsler v3»):
 * their notifications, newest first, each with what it is about named as
 * they may see it now and, if it asks for an answer, whether it still does
 * (UX-IA-019). Read state is never changed by reading it.
 */
export const readNotificationCentre = defineQuery({
  name: "notification.read_centre",
  input: notificationListQuerySchema,
  policy: listNotificationsPolicy,
  load: async ({ db, actor, input, now }) => {
    const reader = homeReader({ db, clock: () => now }, actor);
    const page = await reader.query(listNotifications, input);
    const notifications = await describe(
      { db, actor, userId: actingUserId(actor), now, reader },
      page.notifications,
    );

    return { resource: { ...page, notifications }, context: undefined };
  },
  present: ({ resource }): NotificationCentrePage => resource,
});
