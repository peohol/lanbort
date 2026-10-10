import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { registrationHref, returnParam, returnPath } from "@/navigation/routes";
import { newAccountsAreOpen } from "@/server/new-accounts";
import { getPageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Logg inn – Lånbort" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = returnPath((await searchParams)[returnParam]);
  const account = await getPageAccount();

  if (account) {
    redirect(
      account.status === "pending_registration"
        ? registrationHref(next)
        : (next ?? "/"),
    );
  }

  const newAccounts = await newAccountsAreOpen();

  return (
    <main>
      <h1>{newAccounts ? "Logg inn eller opprett konto" : "Logg inn"}</h1>
      <SignInForm newAccounts={newAccounts} {...(next ? { next } : {})} />
    </main>
  );
}
