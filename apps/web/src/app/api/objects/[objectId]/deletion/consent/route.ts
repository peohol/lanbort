import { consentToObjectDeletion } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** Deletes permanently once every owner has consented (PS-OBJ-011). */
export const POST = userPathCommandRoute(consentToObjectDeletion);
