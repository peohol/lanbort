import { startPilotCampaign } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ name }`: the lead starts a campaign, one open at a time. */
export const POST = pilotOnly(userCommandRoute(startPilotCampaign));
