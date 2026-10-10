import { removeMember } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An impartial administrator ends a membership, with the reason (PS-ENV-021). */
export const POST = userCommandRoute(removeMember);
