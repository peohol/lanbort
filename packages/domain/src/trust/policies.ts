import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";

/**
 * What decides whether a viewer has legitimate access to someone's profile
 * (vision «Hvem kan se fritekstanmeldelser?»): the person themselves always;
 * anyone else only while the person has an active account, through a
 * friendship or a shared environment where both are active members now, and
 * never across a block in either direction (PS-USR-006). A former friendship,
 * membership or loan gives no access (scenario 43, UX-PRIV-007).
 */
export interface ProfileAccessResource {
  readonly subjectUserId: string;
  readonly subjectActive: boolean;
  readonly friends: boolean;
  readonly shareEnvironment: boolean;
  readonly blockedEitherWay: boolean;
}

export function hasProfileAccess(
  viewerId: string,
  resource: ProfileAccessResource,
): boolean {
  return (
    viewerId === resource.subjectUserId ||
    (resource.subjectActive &&
      !resource.blockedEitherWay &&
      (resource.friends || resource.shareEnvironment))
  );
}

/**
 * Without access the person looks like one who does not exist, so nobody
 * learns of a block or a hidden shared context (PS-USR-006, PS-NFR-002).
 */
const withProfileAccess: ResourceRule<ProfileAccessResource, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" && hasProfileAccess(actor.userId, resource)
    ? allow
    : deny("not_found");

/** PS-TRUST-006/007: a person's trust profile and the reviews about them. */
export const readTrustProfilePolicy = definePolicy<ProfileAccessResource, void>(
  {
    action: "trust_profile.read",
    actor: [requireActiveAccount],
    resource: [withProfileAccess],
  },
);

export const trustPolicies = [readTrustProfilePolicy];
