import { listRoles } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** Administrators: who holds and is invited to the roles (PS-ENV-003). */
export const GET = userQueryRoute(listRoles);
