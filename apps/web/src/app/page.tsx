import { isDomainError, readHome, readNotification } from "@lanbort/domain";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HomeView } from "@/components/home-view";
import { NotificationRedirect } from "@/components/notification-redirect";
import { notificationsHref } from "@/navigation/areas";
import { hrefFor } from "@/navigation/targets";
import { getPageAccount, pageQuery } from "@/server/session";

/** The query parameter of the link in a notification's e-mail (WP-41). */
const notificationParam = "varsel";

/**
 * The notification an e-mail's link names, if it is the caller's own; any
 * other id is treated as no notification at all (PS-NFR-002).
 */
async function linkedNotification(id: string | string[] | undefined) {
  if (typeof id !== "string") return null;

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

  if (account?.status === "pending_registration") {
    redirect("/registrering");
  }

  if (!account) {
    return (
      <main>
        <h1>Lånbort</h1>
        <p>Lån ting av mennesker du stoler på.</p>
        <Link className="button button-primary" href="/logg-inn">
          Logg inn eller opprett konto
        </Link>
      </main>
    );
  }

  const notification = await linkedNotification(
    (await searchParams)[notificationParam],
  );

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

  return <HomeView realName={account.realName ?? ""} home={home!} />;
}
