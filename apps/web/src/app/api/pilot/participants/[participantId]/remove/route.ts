import { removePilotParticipant } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The participant leaves the pilot; their open tasks are withdrawn. */
export const POST = pilotOnly(userPathCommandRoute(removePilotParticipant));
