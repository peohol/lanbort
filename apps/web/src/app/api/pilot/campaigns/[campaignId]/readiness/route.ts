import { runPilotReadinessCheck } from "@lanbort/domain";
import { commandResponse } from "@/server/http/body";
import { pilotOnly } from "@/server/http/chat-gate";
import { route } from "@/server/http/route";
import { runtimePilotChecks } from "@/server/pilot-readiness";

/**
 * The lead runs the automatic checks of the current phase's checklist. The
 * server runs them and records what it found; the browser only names the
 * campaign. Nothing outside (GitHub, a test e-mail) is asked before the
 * server has settled that this is the lead, that the campaign is open in a
 * phase with checks, and that the run is within its budget: anyone else
 * gets what they would for a campaign that does not exist.
 */
export const POST = pilotOnly(
  route.user(async ({ request, requestId, params, actor, domain }) =>
    commandResponse(
      await runPilotReadinessCheck(
        domain,
        { actor, campaignId: params.campaignId, correlationId: requestId },
        (campaignId) =>
          runtimePilotChecks(domain, request.nextUrl.origin, {
            campaignId,
            leadId: actor.userId,
          }),
      ),
    ),
  ),
);
