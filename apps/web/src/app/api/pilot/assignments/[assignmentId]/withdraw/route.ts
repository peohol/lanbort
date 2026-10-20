import { withdrawPilotTask } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The lead takes a task back. */
export const POST = pilotOnly(userPathCommandRoute(withdrawPilotTask));
