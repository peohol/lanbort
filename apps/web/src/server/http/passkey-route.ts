import {
  type CommandDefinition,
  executeCommand,
  type StewardPasskeyCommands,
} from "@lanbort/domain";
import { passkeyCommands } from "../runtime";
import { readJson } from "./body";
import { stewardsOnly } from "./chat-gate";
import { route } from "./route";

/**
 * One step of a steward's WebAuthn ceremony (ADR-0011), with the deployment's
 * relying party. The session's id comes from the verified identity, so a
 * ceremony is bound to the sign-in session that started it.
 */
export function passkeyRoute(step: keyof StewardPasskeyCommands) {
  return stewardsOnly(
    route.user(async ({ request, requestId, actor, domain }) => {
      const command = passkeyCommands()[step] as CommandDefinition<
        unknown,
        unknown,
        unknown,
        unknown
      >;
      const { output } = await executeCommand(domain, command, {
        actor,
        input: await readJson(request),
        correlationId: requestId,
      });

      return Response.json(output);
    }),
  );
}
