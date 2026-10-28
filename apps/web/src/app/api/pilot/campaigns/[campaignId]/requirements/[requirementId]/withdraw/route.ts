import { withdrawPilotConfirmation } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The lead takes back a confirmation of a manual requirement. */
export const POST = pilotOnly(userPathCommandRoute(withdrawPilotConfirmation));
