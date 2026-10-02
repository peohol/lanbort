import { setObjectApproval } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ environmentId, required }`: whether objects need approval (PS-ENV-011). */
export const POST = userCommandRoute(setObjectApproval);
