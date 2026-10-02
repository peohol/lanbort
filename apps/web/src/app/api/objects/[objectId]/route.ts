import { getObject, updateObject } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

export const GET = userQueryRoute(getObject);

/** Edits fields; refused with `conflict` if based on an old version. */
export const PATCH = userCommandRoute(updateObject);
