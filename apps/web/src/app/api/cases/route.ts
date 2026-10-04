import { listOwnCases } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The caller's own cases as a participant, newest first. */
export const GET = userQueryRoute(listOwnCases);
