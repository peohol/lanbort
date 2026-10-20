import { changePilotDefect } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ severity?, status? }`: the lead prioritizes and follows up a defect. */
export const POST = pilotOnly(userCommandRoute(changePilotDefect));
