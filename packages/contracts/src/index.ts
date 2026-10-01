import { z } from "zod";

// Strict: an unexpected field (for example environment or database details)
// must fail validation instead of being silently stripped.
export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("lanbort-web"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
