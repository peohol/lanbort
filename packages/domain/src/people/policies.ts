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

export const peoplePolicies = [readPersonPolicy];
