import { verifyTotpSchema } from "@lanbort/contracts";
import { parseInput } from "@lanbort/domain";
import { readJson } from "@/server/http/body";
import { route } from "@/server/http/route";
import { verifyTotp } from "@/server/security";

/** Confirms a new authenticator app, or the second factor for this session. */
export const POST = route.user(async (context) => {
  const { code } = parseInput(
    verifyTotpSchema,
    await readJson(context.request),
  );

  return Response.json(await verifyTotp(context, code));
});
