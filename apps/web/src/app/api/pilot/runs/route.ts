import { recordPilotRun } from "@lanbort/domain";
import { appVersion } from "@/server/env";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * One test run, recorded by the lead with the version of the app that
 * serves it, never one the browser names.
 */
export const POST = pilotOnly(
  userCommandRoute(recordPilotRun, () => ({ appVersion: appVersion() })),
);
