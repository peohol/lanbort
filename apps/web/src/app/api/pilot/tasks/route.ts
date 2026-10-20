import { readPilotTasks } from "@lanbort/domain";
import { pilotOnly } from "@/server/http/chat-gate";
import { userQueryRoute } from "@/server/http/command-route";

/** A participant's own open tasks, and nothing about anyone else. */
export const GET = pilotOnly(userQueryRoute(readPilotTasks));
