import { readHome } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The caller's Home: what waits for them, in order (UX-IA-005). */
export const GET = userQueryRoute(readHome);
