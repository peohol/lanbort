import { approveMembership } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator approves an application or a reactivation. */
export const POST = userCommandRoute(approveMembership);
