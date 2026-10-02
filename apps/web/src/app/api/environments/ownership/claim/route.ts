import { claimOwnership } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator registers interest in a vacant ownership (PS-ENV-013). */
export const POST = userCommandRoute(claimOwnership);
