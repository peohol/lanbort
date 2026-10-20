import { readPilotWorkspace } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userQueryRoute } from "@/server/http/command-route";

/** The pilot lead's overview: campaign, tests, progress, defects, people. */
export const GET = pilotOnly(userQueryRoute(readPilotWorkspace));
