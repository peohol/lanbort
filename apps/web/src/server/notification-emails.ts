import type { NotificationEmailServices } from "@lanbort/domain";
import { createResendSender } from "@lanbort/email";
import { serverEnv } from "./env";

let services: NotificationEmailServices | undefined;

/**
 * The e-mail adapter and the link base for notification e-mails, or
 * undefined when this environment has no e-mail configured; the e-mail job
 * then answers `unavailable`, the queue waits, and nothing else is affected.
 */
export function notificationEmailServices():
  NotificationEmailServices | undefined {
  const env = serverEnv();

  if (!env.RESEND_API_KEY || !env.NOTIFICATION_EMAIL_FROM || !env.APP_URL) {
    return undefined;
  }

  services ??= {
    sender: createResendSender({
      apiKey: env.RESEND_API_KEY,
      from: env.NOTIFICATION_EMAIL_FROM,
    }),
    appUrl: env.APP_URL,
  };

  return services;
}
