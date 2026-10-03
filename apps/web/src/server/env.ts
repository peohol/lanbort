import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  /** Publishable (anon) key, used for sign-in only. */
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /**
   * Secret key for the storage adapter only (private object images). Server
   * only; never sent to the browser. Without it, image routes are unavailable.
   */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  /** Shared secret for scheduled jobs (Vercel Cron sends it as a bearer token). */
  CRON_SECRET: z.string().min(32).optional(),
  /**
   * Notification e-mail (WP-41): the Resend API key (server only), the sender
   * on a verified domain and the app's public address for links. Without all
   * three, e-mails wait in the queue and the e-mail job answers `unavailable`.
   */
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFICATION_EMAIL_FROM: z.string().min(3).optional(),
  APP_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Server configuration, validated on first use rather than at import time so
 * that `next build` does not need runtime secrets. Error messages name the
 * missing variables, never their values.
 */
export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);

    if (!parsed.success) {
      const names = parsed.error.issues.map((issue) => issue.path.join("."));
      throw new Error(`Invalid server environment: ${names.join(", ")}`);
    }

    cached = parsed.data;
  }

  return cached;
}
