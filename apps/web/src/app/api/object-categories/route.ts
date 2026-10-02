import { executeQuery, listObjectCategories } from "@lanbort/domain";
import { route } from "@/server/http/route";

/** The shared category structure for objects (PS-OBJ-002). */
export const GET = route.user(async ({ actor, domain }) =>
  Response.json(
    await executeQuery(domain, listObjectCategories, { actor, input: {} }),
  ),
);
