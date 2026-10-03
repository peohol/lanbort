import { openEnvironmentContact } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A member writes to the environment's administrators as a function: `{ environmentId, body }` (PS-COM-010). */
export const POST = userCommandRoute(openEnvironmentContact);
