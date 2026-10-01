import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegistrationForm } from "@/components/registration-form";
import { getPageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Fullfør kontoen – Lånbort" };

export default async function RegistrationPage() {
  const account = await getPageAccount();

  if (!account) {
    redirect("/logg-inn");
  }

  if (account.status === "active") {
    redirect("/");
  }

  return (
    <main>
      <h1>Fullfør kontoen din</h1>
      <RegistrationForm />
    </main>
  );
}
