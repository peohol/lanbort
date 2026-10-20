import { assignPilotTask } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ campaignId, testId, participantId, goal }`: a task for a participant. */
export const POST = pilotOnly(userCommandRoute(assignPilotTask));
