import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegistrationForm } from "@/components/registration-form";
import { returnParam, returnPath, signInHref } from "@/navigation/routes";
import { getPageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Fullfør kontoen – Lånbort" };

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = returnPath((await searchParams)[returnParam]);
  const account = await getPageAccount();

  if (!account) {
    redirect(signInHref(next));
  }

  if (account.status !== "pending_registration") {
    redirect(next ?? "/");
  }

  return (
    <main>
      <h1>Fullfør kontoen din</h1>
      <RegistrationForm {...(next ? { next } : {})} />
    </main>
  );
}
