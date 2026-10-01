import { route } from "@/server/http/route";
import { securityStatus } from "@/server/security";

/** The own authenticator app status, session strength and global roles. */
export const GET = route.user(async (context) =>
  Response.json(await securityStatus(context)),
);
