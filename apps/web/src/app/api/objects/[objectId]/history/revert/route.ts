import { revertObject } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * Brings back the content of `{ version }` as a new version; refused with
 * `conflict` unless `{ expectedVersion }` is current.
 */
export const POST = userCommandRoute(revertObject);
