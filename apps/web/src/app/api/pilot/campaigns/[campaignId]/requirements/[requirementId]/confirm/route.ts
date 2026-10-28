import { confirmPilotRequirement } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ note }`: the lead confirms a manual requirement, saying how. */
export const POST = pilotOnly(userCommandRoute(confirmPilotRequirement));
