import { addPilotParticipant } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ email }`: an existing account joins the pilot under a pseudonym. */
export const POST = pilotOnly(userCommandRoute(addPilotParticipant));
