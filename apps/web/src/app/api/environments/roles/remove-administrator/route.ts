import { removeAdministrator } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The owner removes the administrator role from `{ userId }`. */
export const POST = userCommandRoute(removeAdministrator);
