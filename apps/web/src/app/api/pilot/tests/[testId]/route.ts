import { readPilotTest } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userQueryRoute } from "@/server/http/command-route";

/** One test card for the lead: its standing, history and tasks. */
export const GET = pilotOnly(userQueryRoute(readPilotTest));
