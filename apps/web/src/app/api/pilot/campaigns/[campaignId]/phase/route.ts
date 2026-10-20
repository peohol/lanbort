import { changePilotPhase } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ phase }`: the lead moves the open campaign to another phase. */
export const POST = pilotOnly(userCommandRoute(changePilotPhase));
