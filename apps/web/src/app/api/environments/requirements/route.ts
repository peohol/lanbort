import { updateRequirements } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Administrators replace the membership requirements (PS-ENV-005–006). */
export const POST = userCommandRoute(updateRequirements);
