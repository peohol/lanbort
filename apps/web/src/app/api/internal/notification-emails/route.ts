import {
  authorizeActor,
  deliverNotificationEmails,
  deliverNotificationEmailsPolicy,
  notificationEmailProcess,
} from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { notificationEmailServices } from "@/server/notification-emails";

export const dynamic = "force-dynamic";

/**
 * Sends due notification e-mails (WP-41). Called by the scheduler with the
 * cron secret; safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  notificationEmailProcess,
  async ({ actor, domain }) => {
    authorizeActor(deliverNotificationEmailsPolicy, { actor, now: new Date() });
    const services = notificationEmailServices();

    return services
      ? Response.json(await deliverNotificationEmails(domain.db, services))
      : errorResponse("unavailable");
  },
);
