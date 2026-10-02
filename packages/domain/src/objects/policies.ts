import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import { requireActiveAccount } from "../authorization/rules";

/** What object policies decide on, loaded inside the command or query. */
export interface ObjectResource {
  readonly objectId: string;
  /** Current registered owners (`app.object_owners`). */
  readonly ownerIds: readonly string[];
}

/**
 * Only the object's owners can see or manage it until publication (WP-25)
 * and co-ownership (WP-26) add other ways in. Anyone else gets `not_found`,
 * so an object's existence is never revealed.
 */
export const isObjectOwner: ResourceRule<ObjectResource, void> = ({
  actor,
  resource,
}) =>
  actor.kind === "user" && resource.ownerIds.includes(actor.userId)
    ? allow
    : deny("not_found");

/** An action only the object's owners may take. */
function ownerPolicy(action: string) {
  return definePolicy<ObjectResource, void>({
    action,
    actor: [requireActiveAccount],
    resource: [isObjectOwner],
  });
}

/** Any registered user can create an object; they become its owner. */
export const createObjectPolicy = definePolicy({
  action: "object.create",
  actor: [requireActiveAccount],
});

/** The signed-in user's own objects ("Mine ting"). */
export const listOwnObjectsPolicy = definePolicy<unknown, void>({
  action: "object.list_own",
  actor: [requireActiveAccount],
});

/** The shared category structure is the same for every registered user. */
export const listObjectCategoriesPolicy = definePolicy<unknown, void>({
  action: "object_category.list",
  actor: [requireActiveAccount],
});

export const readObjectPolicy = ownerPolicy("object.read");
export const updateObjectPolicy = ownerPolicy("object.update");
export const archiveObjectPolicy = ownerPolicy("object.archive");
export const restoreObjectPolicy = ownerPolicy("object.restore");
export const addObjectImagePolicy = ownerPolicy("object.add_image");
export const removeObjectImagePolicy = ownerPolicy("object.remove_image");

export const ownerPolicies = [
  readObjectPolicy,
  updateObjectPolicy,
  archiveObjectPolicy,
  restoreObjectPolicy,
  addObjectImagePolicy,
  removeObjectImagePolicy,
];

export const objectPolicies = [
  createObjectPolicy,
  listOwnObjectsPolicy,
  listObjectCategoriesPolicy,
  ...ownerPolicies,
];
