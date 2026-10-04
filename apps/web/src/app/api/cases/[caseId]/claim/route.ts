import { claimCase } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** A handler takes the case while nobody has it (PS-COM-011). */
export const POST = userPathCommandRoute(claimCase);
