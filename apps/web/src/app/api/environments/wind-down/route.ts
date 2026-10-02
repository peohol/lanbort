import { startEnvironmentWindDown } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The owner starts winding the environment down (PS-ENV-012). */
export const POST = userCommandRoute(startEnvironmentWindDown);
