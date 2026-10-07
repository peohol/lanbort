import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";
import { hasProfileAccess } from "../trust/policies";
import { type PersonRelation, profileAccessOf } from "./store";

/**
 * Whether the viewer may open the person's page (WP-86): never for a
 * deleted account (UX-PRIV-010); always their own; anyone whose profile
 * they have access to (friends or a shared environment now, PS-TRUST-007);
 * someone they block, so they can lift it; and someone with a pending
 * friend request between them, so it can be answered or withdrawn. A
 * person who blocks the viewer, or whose account is not active, looks like
 * one who does not exist (PS-USR-006, UX-PRIV-007).
 */
export function personVisible(person: PersonRelation): boolean {
  const { pair } = person;

  return (
    person.realName !== null &&
    (pair === null ||
      hasProfileAccess(person.viewerId, profileAccessOf(person)) ||
      pair.blockedByActor ||
      (pair.otherActive &&
        !pair.blockedByOther &&
        pair.openFriendship?.status === "pending"))
  );
}

/**
 * Whether the viewer may see the person's profile picture (PS-USR-002):
 * only where they may open the person's page, and then as the person
 * chose, generally, to friends or only to themselves.
 */
export function pictureVisible(person: PersonRelation): boolean {
  const { picture, pair } = person;

  if (!picture || !personVisible(person)) {
    return false;
  }

  switch (picture.visibility) {
    case "general":
      return true;
    case "friends":
      return pair === null || pair.openFriendship?.status === "active";
    case "only_me":
      return pair === null;
  }
}

const visibleToActor: ResourceRule<PersonRelation, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" &&
  actor.userId === resource.viewerId &&
  personVisible(resource)
    ? allow
    : deny("not_found");

/** WP-86: a person's page. */
export const readPersonPolicy = definePolicy<PersonRelation, void>({
  action: "person.read",
  actor: [requireActiveAccount],
  resource: [visibleToActor],
});

/** A person's profile picture, for those who may see it. */
export const readProfilePicturePolicy = definePolicy<PersonRelation, void>({
  action: "profile_picture.read",
  actor: [requireActiveAccount],
  resource: [
    ({ actor, resource }) =>
      actor.kind === "user" &&
      actor.userId === resource.viewerId &&
      pictureVisible(resource)
        ? allow
        : deny("not_found"),
  ],
});

/** The caller's own profile, the only one whose picture they change. */
export interface OwnProfile {
  readonly userId: string;
}

/** Adding, replacing or removing one's own picture, and who sees it. */
export const changeProfilePicturePolicy = definePolicy<OwnProfile, void>({
  action: "profile_picture.change",
  actor: [requireActiveAccount],
  resource: [
    ({ actor, resource }) =>
      actor.kind === "user" && actor.userId === resource.userId
        ? allow
        : deny("not_found"),
  ],
});

export const peoplePolicies = [
  readPersonPolicy,
  readProfilePicturePolicy,
  changeProfilePicturePolicy,
];
