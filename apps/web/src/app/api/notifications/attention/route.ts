import { markAreaSeen, readAttention } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The bell's number and what is new in each area, for the frame. */
export const GET = userQueryRoute(readAttention);

/** The caller opened an area's own page (UX-IA-022). */
export const POST = userCommandRoute(markAreaSeen);
