import { liftConcealedRestrictions } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * An administrator lifts every bar from a stricter type they were not
 * active in, without learning whether there were any.
 */
export const POST = userCommandRoute(liftConcealedRestrictions);
