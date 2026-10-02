import { rejectMembership } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator rejects, optionally barring new attempts. */
export const POST = userCommandRoute(rejectMembership);
