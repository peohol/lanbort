import { liftRestriction } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator lets a barred `{ userId }` try again. */
export const POST = userCommandRoute(liftRestriction);
