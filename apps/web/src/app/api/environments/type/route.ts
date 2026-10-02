import { changeEnvironmentType } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * Administrators change the type: a stricter one at once, a weaker one as a
 * proposal the members decide on (PS-ENV-007–008).
 */
export const POST = userCommandRoute(changeEnvironmentType);
