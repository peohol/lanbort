import { searchEnvironments } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** Finn: `?q=&type=`, open and closed environments that take new members. */
export const GET = userQueryRoute(searchEnvironments);
