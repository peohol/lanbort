import { resignAdministrator } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator who is not owner gives up the role. */
export const POST = userCommandRoute(resignAdministrator);
