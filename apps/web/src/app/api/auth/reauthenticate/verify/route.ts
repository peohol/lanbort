import { reauthenticateSchema } from "@lanbort/contracts";
import { parseInput } from "@lanbort/domain";
import { readJson } from "@/server/http/body";
import { route } from "@/server/http/route";
import { confirmReauthentication } from "@/server/reauthentication";

/** The new code renews the session, which counts as a recent sign-in. */
export const POST = route.user(async (context) => {
  const { code } = parseInput(
    reauthenticateSchema,
    await readJson(context.request),
  );

  await confirmReauthentication(context, code);

  return new Response(null, { status: 204 });
});
