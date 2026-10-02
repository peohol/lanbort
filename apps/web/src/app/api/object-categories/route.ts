import { listObjectCategories } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The shared category structure for objects (PS-OBJ-002). */
export const GET = userQueryRoute(listObjectCategories);
