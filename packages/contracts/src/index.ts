import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("lanbort-web"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
