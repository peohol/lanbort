import { route } from "@/server/http/route";
import { requestReauthentication } from "@/server/security";

/** Sends a new code to the own address before a sensitive action. */
export const POST = route.user(async (context) => {
  await requestReauthentication(context);

  return new Response(null, { status: 202 });
});
