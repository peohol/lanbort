import { blockPublication } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A separate local safety or moderation measure on a publication. */
export const POST = userCommandRoute(blockPublication);
