import { reportPilotDefect } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** A defect found outside a test run. */
export const POST = pilotOnly(userCommandRoute(reportPilotDefect));
