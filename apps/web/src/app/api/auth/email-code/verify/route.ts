import {
  type SignedInResponse,
  verifyEmailCodeSchema,
} from "@lanbort/contracts";
import { parseInput, resolveUserActor } from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { readJson } from "@/server/http/body";
import { route } from "@/server/http/route";

/**
 * UX-JRN-001 step 2: the code proves control of the address. A first-time
 * identity gets its internal account here and continues to registration.
 */
export const POST = route.public(
  async ({ request, requestId, auth, domain }) => {
    const { email, code } = parseInput(
      verifyEmailCodeSchema,
      await readJson(request),
    );
    const identity = await auth.verifyEmailCode(email, code);
    const actor = await resolveUserActor(domain, identity, requestId);

    if (!actor) {
      await auth.signOut();
      return errorResponse("unauthenticated");
    }

    return Response.json({
      accountStatus: actor.accountStatus,
    } satisfies SignedInResponse);
  },
);
