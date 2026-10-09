import { isDomainError, readHome, readNotification } from "@lanbort/domain";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeView } from "@/components/home-view";
import { NotificationRedirect } from "@/components/notification-redirect";
import { notificationsHref } from "@/navigation/areas";
import {
  notificationLinkHref,
  notificationParam,
  registrationHref,
  signInHref,
} from "@/navigation/routes";
import { hrefFor } from "@/navigation/targets";
import { getPageAccount, pageQuery } from "@/server/session";

/**
 * The notification an e-mail's link names, if it is the caller's own; any
 * other id is treated as no notification at all (PS-NFR-002).
 */
async function linkedNotification(id: string | undefined) {
  if (id === undefined) return null;

  try {
    return await pageQuery(readNotification, { notificationId: id });
  } catch (error) {
    if (
      isDomainError(error) &&
      ["not_found", "invalid_input"].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getPageAccount();
  const linked = (await searchParams)[notificationParam];
  const notificationId = typeof linked === "string" ? linked : undefined;
  // An e-mail link survives signing in and finishing the account.
  const back = notificationId && notificationLinkHref(notificationId);

  if (account?.status === "pending_registration") {
    redirect(registrationHref(back));
  }

  if (!account) {
    return (
      <main>
        <h1>Lånbort</h1>
        <p>Lån ting av mennesker du stoler på.</p>
        <Link className="button button-primary" href={signInHref(back)}>
          Logg inn eller opprett konto
        </Link>
      </main>
    );
  }

  const notification = await linkedNotification(notificationId);

  if (notification) {
    // A context without a page of its own yet is explained in the centre.
    return (
      <NotificationRedirect
        notificationId={notification.id}
        href={hrefFor(notification.target) ?? notificationsHref}
      />
    );
  }

  const home = await pageQuery(readHome, {});

  return <HomeView home={home!} />;
}
