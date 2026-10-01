import { platformRoleSchema } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/** A global role was granted. The reason stays on the grant row only. */
export const platformRoleGranted = defineEvent({
  type: "platform_role.granted",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ role: platformRoleSchema }),
});

export const platformRoleRevoked = defineEvent({
  type: "platform_role.revoked",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({ role: platformRoleSchema }),
});
