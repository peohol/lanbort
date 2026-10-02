import { executeQuery, getOwnAccount } from "@lanbort/domain";
import { route } from "@/server/http/route";

export const GET = route.user(async ({ actor, domain }) =>
  Response.json(
    await executeQuery(domain, getOwnAccount, { actor, input: {} }),
  ),
);
