import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { getPageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Logg inn – Lånbort" };

export default async function SignInPage() {
  const account = await getPageAccount();

  if (account) {
    redirect(account.status === "pending_registration" ? "/registrering" : "/");
  }

  return (
    <main>
      <h1>Logg inn eller opprett konto</h1>
      <SignInForm />
    </main>
  );
}
