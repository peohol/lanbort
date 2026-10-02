import { leaveEnvironment } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Leaves, withdraws an application or declines an invitation. */
export const POST = userCommandRoute(leaveEnvironment);
