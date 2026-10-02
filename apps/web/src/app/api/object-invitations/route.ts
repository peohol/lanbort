import { listCoOwnerInvitations } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** Co-ownership invitations the caller has received. */
export const GET = userQueryRoute(listCoOwnerInvitations);
