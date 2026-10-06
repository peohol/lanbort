import { readPerson } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?userId=`: that person as the signed-in user may see them (WP-86). */
export const GET = userQueryRoute(readPerson);
