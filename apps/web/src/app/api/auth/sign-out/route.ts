import { route } from "@/server/http/route";

/** Public so that a broken or expired session can always be cleared. */
export const POST = route.public(async ({ auth }) => {
  await auth.signOut();

  return new Response(null, { status: 204 });
});
