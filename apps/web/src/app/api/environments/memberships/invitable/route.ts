import { listInvitableEnvironments } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?userId=`: where the caller may invite that person now (PS-ENV-018). */
export const GET = userQueryRoute(listInvitableEnvironments);
