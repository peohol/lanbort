import { createObject, listOwnObjects } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The signed-in user's own objects ("Mine ting"). */
export const GET = userQueryRoute(listOwnObjects);

/** Creates a global object owned by the user (UX-JRN-003). */
export const POST = userCommandRoute(createObject);
