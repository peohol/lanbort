import { joinEnvironment } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Joins an open environment, applies to a closed one, or reactivates. */
export const POST = userCommandRoute(joinEnvironment);
