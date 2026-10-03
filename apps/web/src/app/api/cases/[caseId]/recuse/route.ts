import { recuseFromCase } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** A handler steps aside as not impartial (PS-USR-009). */
export const POST = userPathCommandRoute(recuseFromCase);
