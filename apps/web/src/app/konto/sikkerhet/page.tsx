import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SecuritySettings } from "@/components/security-settings";
import { getPageAccount } from "@/server/session";

export const metadata: Metadata = {
  title: "Innlogging og sikkerhet – Lånbort",
};

export default async function SecurityPage() {
  const account = await getPageAccount();

  if (!account) {
    redirect("/logg-inn");
  }

  if (account.status !== "active") {
    redirect("/registrering");
  }

  return (
    <main>
      <p>
        <Link href="/">Tilbake</Link>
      </p>
      <h1>Innlogging og sikkerhet</h1>
      <SecuritySettings />
    </main>
  );
}
