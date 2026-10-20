import { closePilotCampaign } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The lead closes the campaign; it is read-only from then on. */
export const POST = pilotOnly(userPathCommandRoute(closePilotCampaign));
