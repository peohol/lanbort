import {
  checkPilotReadiness,
  executeCommand,
  executeQuery,
  readPilotRole,
} from "@lanbort/domain";
import { commandResponse } from "@/server/http/body";
import { pilotOnly } from "@/server/http/chat-gate";
import { route } from "@/server/http/route";
import { runtimePilotChecks } from "@/server/pilot-readiness";

/**
 * The lead runs the automatic checks of the current phase's checklist. The
 * server runs them and records what it found; the browser only names the
 * campaign. Nobody but the lead makes the server ask anything: anyone else
 * gets what they would for a campaign that does not exist.
 */
export const POST = pilotOnly(
  route.user(async ({ request, requestId, params, actor, domain }) => {
    const { role } = await executeQuery(domain, readPilotRole, {
      actor,
      input: {},
    });
    const results =
      role === "lead"
        ? await runtimePilotChecks(domain, request.nextUrl.origin, actor.userId)
        : [];

    return commandResponse(
      await executeCommand(domain, checkPilotReadiness, {
        actor,
        input: { campaignId: params.campaignId, results },
        correlationId: requestId,
      }),
    );
  }),
);
