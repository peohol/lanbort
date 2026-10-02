import { rejectPublication } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator rejects or removes a publication locally (PS-OBJ-017). */
export const POST = userCommandRoute(rejectPublication);
