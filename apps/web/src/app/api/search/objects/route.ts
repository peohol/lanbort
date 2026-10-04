import { searchObjects } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * Finn: `?q=&categoryId=&environmentId=&availableFrom=&availableTo=`, the
 * objects the caller finds in their environments.
 */
export const GET = userQueryRoute(searchObjects);
