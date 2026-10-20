import { reportPilotTask } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ outcome, comment? }`: a participant reports on their own task. */
export const POST = pilotOnly(userCommandRoute(reportPilotTask));
