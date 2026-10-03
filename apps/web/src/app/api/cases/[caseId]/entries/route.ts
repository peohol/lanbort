import { writeCaseEntry } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Writes `{ body }` in the case; a handler names the audience, and a correction what it corrects (PS-COM-014). */
export const POST = userCommandRoute(writeCaseEntry);
