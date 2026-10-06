import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { registrationHref, returnParam, returnPath } from "@/navigation/routes";
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

  return (
    <main>
      <h1>Logg inn eller opprett konto</h1>
      <SignInForm {...(next ? { next } : {})} />
    </main>
  );
}
