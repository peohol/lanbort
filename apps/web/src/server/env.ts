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
  /**
   * Private chat (WP-43): `true` locally and in CI, `pilot` in the closed
   * pilot, off otherwise (`chatEnabled`, ADR-0010 §2, PS-COM-023).
   */
  CHAT_ENABLED: z.string().optional(),
  /**
   * Platform stewards' privileged access and the cases only they handle
   * (ADR-0011, OD-0023): off until WebAuthn and the security controls are
   * verified in this deployment; only the exact value `true` turns it on.
   */
  PLATFORM_STEWARDS_ENABLED: z.string().optional(),
  /**
   * The domain stewards' passkeys are bound to, when it is wider than
   * APP_URL's host (e.g. `xn--lnbort-iua.no` for `www.xn--lnbort-iua.no`).
   * Passkeys only work with APP_URL set; both come from configuration,
   * never from the request.
   */
  WEBAUTHN_RP_ID: z.string().min(1).optional(),
  /**
   * Who runs Lånbort and is responsible for its personal data, and the
   * address where people reach them about security and privacy. Shown on the
   * privacy page; kept out of the repository, which is public.
   */
  OPERATOR_NAME: z.string().min(1).optional(),
  CONTACT_EMAIL: z.string().min(3).optional(),
  /**
   * The accounts (Lånbort's own user ids, comma-separated) that may invite
   * people who have no account yet (PS-USR-015): in the closed pilot only
   * the product owner's. Nobody unless set.
   */
  PILOT_INVITERS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Whether platform stewards can confirm privileged access with passkeys, and
 * so whether the platform's cases can be received and handled at all, in
 * this environment; off unless set (ADR-0011, OD-0023).
 */
export const platformStewardsEnabled = () =>
  process.env.PLATFORM_STEWARDS_ENABLED === "true";

/**
 * Who may invite people without an account to Lånbort (PS-USR-015), from
 * PILOT_INVITERS. Anything that is not a user id is left out.
 */
export function accountInviters(): ReadonlySet<string> {
  return new Set(
    (process.env.PILOT_INVITERS ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => z.uuid().safeParse(id).success),
  );
}

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
