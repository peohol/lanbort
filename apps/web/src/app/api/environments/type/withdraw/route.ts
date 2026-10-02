import { withdrawTypeChange } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Administrators withdraw a proposed weaker type before its deadline. */
export const POST = userCommandRoute(withdrawTypeChange);
