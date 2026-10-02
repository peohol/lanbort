import { unblockPublication } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Lifts a block; the publication starts over as pending or active. */
export const POST = userCommandRoute(unblockPublication);
