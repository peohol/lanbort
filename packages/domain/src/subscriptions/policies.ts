import {
  allow,
  definePolicy,
  deny,
  type ResourceRule,
} from "../authorization/policy";
import {
  requireActiveAccount,
  requireSystemProcess,
} from "../authorization/rules";

/** An object as the caller relates to it. */
export interface FoundObjectResource {
  /** The caller finds the object in at least one of their environments. */
  readonly found: boolean;
}

/**
 * PS-OBJ-014: a user subscribes only to an object they can see, which for
 * someone who does not own it means finding it in an environment. To anyone
 * else the object does not exist.
 */
const findsObject: ResourceRule<FoundObjectResource, void> = ({ resource }) =>
  resource.found ? allow : deny("not_found");

export const subscribeToObjectPolicy = definePolicy<FoundObjectResource, void>({
  action: "object_subscription.subscribe",
  actor: [requireActiveAccount],
  resource: [findsObject],
});

/**
 * The caller's own subscriptions. Ending one needs no access to the object,
 * so a subscription that went inactive can always be removed.
 */
const ownPolicy = (action: string) =>
  definePolicy<unknown, void>({ action, actor: [requireActiveAccount] });

export const unsubscribeFromObjectPolicy = ownPolicy(
  "object_subscription.unsubscribe",
);

export const listObjectSubscriptionsPolicy = ownPolicy(
  "object_subscription.list",
);

/** Name of the scheduled job that looks at subscribed objects again. */
export const objectAvailabilityProcess = "object_subscriptions.availability";

export const lookAtSubscribedObjectsPolicy = definePolicy({
  action: "object_subscription.look_again",
  actor: [requireSystemProcess(objectAvailabilityProcess)],
});

export const subscriptionPolicies = [
  subscribeToObjectPolicy,
  unsubscribeFromObjectPolicy,
  listObjectSubscriptionsPolicy,
  lookAtSubscribedObjectsPolicy,
];
