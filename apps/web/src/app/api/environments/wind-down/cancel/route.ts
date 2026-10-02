import { cancelEnvironmentWindDown } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The owner cancels winding down within the cancellation period. */
export const POST = userCommandRoute(cancelEnvironmentWindDown);
