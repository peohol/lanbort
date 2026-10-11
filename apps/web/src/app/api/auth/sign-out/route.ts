import { endChatSession } from "@lanbort/domain";
import { errorTypeOf, writeLog } from "@lanbort/observability";
import { route } from "@/server/http/route";

/**
 * Public so that a broken or expired session can always be cleared. The
 * session's chat device ends with it (ADR-0010 §7). If that fails, the
 * sign-out still goes ahead, so the browser deletes its chat as well, and
 * the device can be removed from another one.
 */
export const POST = route.public(
  async ({ auth, domain, requestId, resolveActor }) => {
    try {
      const actor = await resolveActor();
      if (actor.kind === "user") {
        await endChatSession(
          domain.db,
          actor.userId,
          actor.authentication.sessionId,
          domain.clock?.(),
        );
      }
    } catch (error) {
      writeLog("error", "chat.end_session_failed", {
        requestId,
        errorType: errorTypeOf(error),
      });
    }

    await auth.signOut();

    return new Response(null, { status: 204 });
  },
);
