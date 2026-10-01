import { requestEmailCodeSchema } from "@lanbort/contracts";
import { parseInput } from "@lanbort/domain";
import { readJson } from "@/server/http/body";
import { route } from "@/server/http/route";

/**
 * UX-JRN-001 step 1: send a one-time code. The answer is the same whether or
 * not the address already has an account.
 */
export const POST = route.public(async ({ request, auth }) => {
  const { email } = parseInput(requestEmailCodeSchema, await readJson(request));

  await auth.requestEmailCode(email);

  return new Response(null, { status: 202 });
});
