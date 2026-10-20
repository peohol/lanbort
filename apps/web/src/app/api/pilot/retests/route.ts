import { requestPilotRetest } from "@lanbort/domain";
import { appVersion } from "@/server/env";
import { pilotOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ campaignId, testIds, note? }`: tests to try again, as of this version. */
export const POST = pilotOnly(
  userCommandRoute(requestPilotRetest, () => ({ appVersion: appVersion() })),
);
